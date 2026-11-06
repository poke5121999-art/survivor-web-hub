/*
 * CHUYẾN TÀU CUỐI — tầng META: ví tiền, người đang có, trang bị, tiến hoá, toa tàu,
 * gacha, cửa hàng, nhiệm vụ, và lưu game.
 *
 * MỌI THỨ Ở ĐÂY TỒN TẠI GIỮA CÁC VÁN. Tách hẳn khỏi bộ máy trong ván (game.js), và
 * tách từ DÒNG ĐẦU TIÊN chứ không tách sau.
 *
 * WHY tách từ đầu: bên repo2d, một object `S` duy nhất ôm cả tiền, đồ đã mua, tủ đồ
 * lẫn lưới tường, quái, cửa — rồi buildLevel() xoá nửa sau của chính nó mỗi màn. Chừng
 * nào chưa có gacha thì sống được; có gacha rồi thì một lần thoát giữa chừng có thể
 * ăn mất người vừa quay ra. Sửa sau phải chạm cả nghìn chỗ đọc `S.`, nên không sửa sau.
 *
 * Cửa DUY NHẤT mà bộ máy trong ván chạm vào ví là CT.finishRun(). Không có cửa thứ hai.
 */
(function (root) {
  'use strict';

  const CT = root.CT;
  const SAVE_KEY = 'chuyen-tau.save.v1';
  const SAVE_VER = 1;

  // ---------------------------------------------------------------------------
  // tiện ích
  // ---------------------------------------------------------------------------
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  CT.clamp = clamp;
  CT.money = n => Math.round(n).toLocaleString('vi-VN');

  // Mốc đổi ngày/tuần. WHY không chia thẳng Date.now()/86400000: phép chia đó lấy mốc
  // UTC, nên "ngày mới" rơi vào 7 giờ sáng giờ Việt Nam và "tuần mới" rơi vào 7 giờ
  // sáng THỨ NĂM (1970-01-01 là thứ Năm). Không ai chọn hai mốc đó — chúng là hệ quả
  // tình cờ của một phép chia. Ở đây chọn có chủ đích: 4 giờ sáng giờ VN, thứ Hai.
  const TZ_OFF = 7 * 3600000;      // UTC+7
  const RESET_H = 4;               // 4 giờ sáng
  function dayIndex() {
    return Math.floor((Date.now() + TZ_OFF - RESET_H * 3600000) / 86400000);
  }
  function weekIndex() {
    // 1970-01-01 là thứ Năm, nên +3 ngày để tuần bắt đầu từ thứ Hai.
    return Math.floor((dayIndex() + 3) / 7);
  }
  CT.dayIndex = dayIndex;
  CT.weekIndex = weekIndex;

  let nextId = 1;
  const newId = () => 'i' + (nextId++);

  // ---------------------------------------------------------------------------
  // TRẠNG THÁI MẶC ĐỊNH
  // ---------------------------------------------------------------------------
  function freshState() {
    const M = {
      v: SAVE_VER,
      gold: 6000, gem: 1200, scrap: 30, ticketC: 3, ticketE: 5,
      chars: {},                 // id -> { shard, skillLv, equip:{slotId:instId} }
      active: null,              // ai đang được chọn để vào ván
      inv: [],                   // trang bị đang có
      evol: {},                  // evolId -> cấp
      cars: [null, null, null, null, null],   // 5 ô toa: carId hoặc null
      carLv: {},                 // carId -> cấp
      maps: {},                  // mapId -> { leg, cleared, best }
      pity: { char: { c5: 0, c4: 0 }, equip: { c5: 0, c4: 0 } },
      spark: { char: 0, equip: 0 },
      quests: { day: -1, week: -1, daily: [], weekly: [], claimed: {}, achClaimed: {} },
      shopLimit: { day: -1, used: {} },
      iap: {},                   // packId -> số lần đã mua (cho nhân đôi lần đầu)
      counters: { runs: 0, wins: 0, loot: 0, kills: 0, legs: 0, skills: 0,
                  pulls: 0, coal: 0, carUps: 0, upgrades: 0, spendVnd: 0, km: 0 },
      week: { runs: 0, wins: 0, loot: 0, kills: 0, carUps: 0 },
      day:  { runs: 0, loot: 0, kills: 0, legs: 0, skills: 0, pulls: 0, coal: 0 },
      opt:  { fx: 1, shake: 1, sound: 1 },   // fx: 1 đầy / 0.5 giảm / 0 tắt
      seenIntro: false
    };
    CT.EVOL.forEach(e => { M.evol[e.id] = 0; });
    CT.MAPS.forEach(m => { M.maps[m.id] = { leg: 0, cleared: false, best: 0 }; });
    M.chars[CT.STARTER] = { shard: 0, skillLv: 1, equip: {} };
    M.active = CT.STARTER;
    M.cars[0] = 'tran';
    M.carLv['tran'] = 1;
    return M;
  }

  let M = CT.M = freshState();

  // ---------------------------------------------------------------------------
  // LƯU / ĐỌC. localStorage là chủ; đám mây chỉ là lớp DƯỚI.
  // WHY: games/BRIDGE.md — "Cloud save is an optional layer UNDER the local save."
  // Không một lời gọi nào ở đây được phép ném lỗi, chặn, hay gác cửa việc chơi.
  // ---------------------------------------------------------------------------
  let saveTimer = 0;
  function save(now) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(M)); } catch (e) { /* riêng tư / đầy */ }
    if (now) pushCloud();
    else { clearTimeout(saveTimer); saveTimer = setTimeout(pushCloud, 4000); }
  }
  function pushCloud() {
    try {
      if (root.HubSave && root.HubSave.isAvailable && root.HubSave.isAvailable()) {
        root.HubSave.storeSave('chuyen-tau', M, { version: M.v });
      }
    } catch (e) { /* không bao giờ chặn game */ }
  }
  CT.save = save;

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d && d.v) M = CT.M = migrate(d);
      } catch (e) { /* hỏng thì chơi lại từ đầu, không văng */ }
    }
    M.inv.forEach(it => {
      const n = parseInt(String(it.id).slice(1), 10);
      if (n >= nextId) nextId = n + 1;
    });
    rollQuests();
    return M;
  }
  CT.load = load;

  // Bảng nội dung có thể DÀI RA sau khi người chơi đã lưu — và cũng có thể NGẮN LẠI,
  // hoặc đổi tên khoá. Bù phần thiếu là việc dễ; VỨT PHẦN THỪA mới là phần giết người:
  // một id mà bản game này không biết nằm lại trong save thì mọi màn menu đọc trúng nó
  // đều ném lỗi, mà save thì sống qua mọi lần tải lại trang.
  function migrate(d) {
    const base = freshState();
    const out = Object.assign(base, d);
    CT.EVOL.forEach(e => { if (out.evol[e.id] == null) out.evol[e.id] = 0; });
    CT.MAPS.forEach(m => { if (!out.maps[m.id]) out.maps[m.id] = { leg: 0, cleared: false, best: 0 }; });
    out.counters  = Object.assign(base.counters, out.counters || {});
    out.day       = Object.assign(base.day, out.day || {});
    out.week      = Object.assign(base.week, out.week || {});
    out.opt       = Object.assign(base.opt, out.opt || {});
    out.pity      = Object.assign(base.pity, out.pity || {});
    out.pity.char = Object.assign({ c5: 0, c4: 0 }, out.pity.char || {});
    out.pity.equip= Object.assign({ c5: 0, c4: 0 }, out.pity.equip || {});
    out.spark     = Object.assign(base.spark, out.spark || {});
    out.quests    = Object.assign(base.quests, out.quests || {});
    out.shopLimit = Object.assign(base.shopLimit, out.shopLimit || {});
    out.iap       = out.iap || {};
    return scrub(out);
  }

  // Vứt mọi id mà bản game này KHÔNG BIẾT. Ba chỗ dưới đây từng làm màn menu trắng
  // vĩnh viễn ở bản Biệt Đội, và vì nguyên nhân nằm trong localStorage nên tải lại
  // trang vẫn y nguyên — người chơi không có cách nào tự thoát ra.
  function scrub(o) {
    // người
    Object.keys(o.chars || {}).forEach(id => { if (!CT.CHAR_BY_ID[id]) delete o.chars[id]; });
    if (!Object.keys(o.chars).length) { o.chars[CT.STARTER] = { shard: 0, skillLv: 1, equip: {} }; }
    Object.keys(o.chars).forEach(id => {
      const c = o.chars[id];
      c.shard = c.shard | 0;
      c.skillLv = clamp(c.skillLv | 0 || 1, 1, CT.SKILL_LV_MAX);
      c.equip = c.equip || {};
      // ô trang bị đã đổi tên thì bỏ; món trỏ vào một id không còn thì cũng bỏ
      Object.keys(c.equip).forEach(sl => {
        if (!CT.SLOT_BY_ID[sl]) { delete c.equip[sl]; return; }
        const iid = c.equip[sl];
        if (!(o.inv || []).some(it => it.id === iid)) delete c.equip[sl];
      });
    });
    if (!o.active || !o.chars[o.active]) o.active = Object.keys(o.chars)[0];

    // trang bị: ô, chỉ số chính, chỉ số phụ đều phải là thứ bản này biết
    o.inv = (o.inv || []).filter(it =>
      it && CT.SLOT_BY_ID[it.slot] && CT.STATS[it.main] &&
      Array.isArray(it.subs) && it.subs.every(s => CT.STATS[s.k]));

    // tiến hoá
    Object.keys(o.evol || {}).forEach(id => {
      if (!CT.EVOL.some(e => e.id === id)) delete o.evol[id];
    });
    // toa tàu
    o.cars = (o.cars || []).slice(0, CT.CAR_SLOTS);
    while (o.cars.length < CT.CAR_SLOTS) o.cars.push(null);
    o.cars = o.cars.map(id => (id && CT.CAR_BY_ID[id]) ? id : null);
    o.carLv = o.carLv || {};
    Object.keys(o.carLv).forEach(id => { if (!CT.CAR_BY_ID[id]) delete o.carLv[id]; });
    o.cars.forEach(id => { if (id && !o.carLv[id]) o.carLv[id] = 1; });
    if (!o.cars.some(Boolean)) { o.cars[0] = 'tran'; o.carLv['tran'] = 1; }

    // map
    Object.keys(o.maps || {}).forEach(id => { if (!CT.MAP_BY_ID[id]) delete o.maps[id]; });

    // nhiệm vụ đã nhận thưởng: bỏ id không còn trong bảng
    const qIds = {};
    CT.QUESTS.daily.forEach(q => { qIds[q.id] = 1; });
    CT.QUESTS.weekly.forEach(q => { qIds[q.id] = 1; });
    Object.keys(o.quests.claimed || {}).forEach(k => { if (!qIds[k]) delete o.quests.claimed[k]; });
    Object.keys(o.quests.achClaimed || {}).forEach(k => {
      if (!CT.ACHS.some(a => a.id === k)) delete o.quests.achClaimed[k];
    });
    o.quests.daily  = (o.quests.daily  || []).filter(id => CT.QUESTS.daily.some(q => q.id === id));
    o.quests.weekly = (o.quests.weekly || []).filter(id => CT.QUESTS.weekly.some(q => q.id === id));

    // quầy đổi: id đã bỏ thì bỏ luôn bộ đếm limit
    o.shopLimit.used = o.shopLimit.used || {};
    Object.keys(o.shopLimit.used).forEach(k => {
      if (!CT.EXCHANGE.some(x => x.id === k)) delete o.shopLimit.used[k];
    });
    // gói nạp
    Object.keys(o.iap).forEach(k => { if (!CT.PACKS.some(p => p.id === k)) delete o.iap[k]; });

    return o;
  }

  // Đồng bộ từ đám mây. KHÔNG BAO GIỜ tráo save giữa ván — người chơi đang cầm đồ
  // trong tay, đổi cả tài khoản dưới chân họ là mất đồ mà không ai giải thích được.
  CT.syncFromHub = function () {
    if (CT.inRun) return Promise.resolve({ ok: false, reason: 'in-run' });
    if (!(root.HubSave && root.HubSave.isAvailable && root.HubSave.isAvailable()))
      return Promise.resolve({ ok: false, reason: 'no-account' });
    return root.HubSave.loadSave('chuyen-tau').then(r => {
      if (!r || !r.ok || !r.found || !r.payload) return { ok: false, reason: 'none' };
      // Đường đám mây phải chạy đúng số lớp kiểm như đường ổ cứng. Một payload viết bởi
      // bản game mới hơn mà nhét thẳng vào là đúng cái lỗi mà scrub() sinh ra để chặn.
      M = CT.M = migrate(r.payload);
      rollQuests();
      save(false);
      return { ok: true };
    }).catch(() => ({ ok: false, reason: 'error' }));
  };

  // ---------------------------------------------------------------------------
  // VÍ
  // ---------------------------------------------------------------------------
  const WALLET = ['gold', 'gem', 'scrap', 'ticketC', 'ticketE'];
  CT.WALLET = WALLET;
  CT.WALLET_LABEL = { gold: 'Vàng', gem: 'Ngọc', scrap: 'Phế liệu',
                      ticketC: 'Vé Người', ticketE: 'Vé Đồ' };
  CT.WALLET_ICON  = { gold: '🪙', gem: '💎', scrap: '⚙️', ticketC: '🎫', ticketE: '🎟️' };

  function can(cost) { return WALLET.every(k => !cost[k] || M[k] >= cost[k]); }
  function spend(cost) {
    if (!can(cost)) return false;
    WALLET.forEach(k => { if (cost[k]) M[k] -= cost[k]; });
    save(); return true;
  }
  function grant(g) {
    if (!g) return;
    WALLET.forEach(k => { if (g[k]) M[k] += g[k]; });
    save();
  }
  CT.can = can; CT.spend = spend; CT.grant = grant;

  // ---------------------------------------------------------------------------
  // CHỈ SỐ NGƯỜI CHƠI — một chỗ duy nhất cộng mọi nguồn lại.
  // ---------------------------------------------------------------------------
  // Nguồn: nền của nhân vật + tiến hoá + sáu ô trang bị + bị động của chính nhân vật.
  CT.statsOf = function (charId) {
    const def = CT.CHAR_BY_ID[charId];
    if (!def) return null;
    const c = M.chars[charId] || { skillLv: 1, equip: {} };
    const s = { hp: def.base.hp, dmg: def.base.dmg, spd: def.base.spd,
                cd: 0, grit: 0, luck: 0, bag: CT.BAG_BASE, fuel: 0 };

    // tiến hoá
    CT.EVOL.forEach(e => {
      const lv = M.evol[e.id] | 0;
      if (!lv) return;
      s[e.stat] = (s[e.stat] || 0) + e.per * lv;
    });

    // trang bị
    CT.SLOTS.forEach(sl => {
      const it = itemById(c.equip[sl.id]);
      if (!it) return;
      addStat(s, it.main, mainVal(it));
      it.subs.forEach(sub => addStat(s, sub.k, sub.v));
    });

    // toa Kho cộng ô bao tải
    M.cars.forEach(id => {
      if (!id) return;
      const car = CT.CAR_BY_ID[id];
      const lv = M.carLv[id] || 1;
      if (car.bagPlus) s.bag += car.bagPlus + (lv - 1);
    });

    // bị động riêng của nhân vật
    const p = def.passive || {};
    if (p.hpMul) s.hp = Math.round(s.hp * p.hpMul);

    s.hp = Math.round(s.hp);
    s.bag = Math.floor(s.bag);
    s.cd = clamp(s.cd, 0, 0.6);
    s.grit = clamp(s.grit, 0, 0.7);
    return s;
  };
  function addStat(s, k, v) {
    if (k === 'hp' || k === 'bag') s[k] = (s[k] || 0) + v;
    else s[k] = (s[k] || 0) + v;
  }

  // Lực chiến: một con số duy nhất để so map. Cố ý thô — nó chỉ để trả lời "mình có
  // nên vào map này chưa", không phải để tối ưu build.
  CT.powerOf = function (charId) {
    const s = CT.statsOf(charId);
    if (!s) return 0;
    const c = M.chars[charId];
    return Math.round(s.hp * 22 + s.dmg * 9000 + s.spd * 3000 +
                      s.cd * 12000 + s.grit * 14000 + s.bag * 260 +
                      (c ? (c.skillLv - 1) * 1800 : 0));
  };

  // ---------------------------------------------------------------------------
  // TRANG BỊ
  // ---------------------------------------------------------------------------
  function itemById(id) { return id ? M.inv.find(i => i.id === id) : null; }
  CT.itemById = itemById;

  const STAR_MAIN = { 3: 1.0, 4: 1.5, 5: 2.2 };
  const BASE_MAIN = { hp: 26, dmg: 0.055, spd: 0.035, cd: 0.032, grit: 0.030, luck: 0.048, bag: 1 };
  const BASE_SUB  = { hp: 11, dmg: 0.022, spd: 0.015, cd: 0.013, grit: 0.013, luck: 0.020 };

  function mainVal(it) {
    return BASE_MAIN[it.main] * STAR_MAIN[it.star] * (1 + it.lv * 0.16);
  }
  CT.mainVal = mainVal;

  function rollItem(star) {
    const slot = pick(CT.SLOTS).id;
    const main = pick(CT.MAIN_BY_SLOT[slot]);
    const nSub = star === 5 ? 3 : star === 4 ? 2 : 1;
    const pool = CT.SUBS.filter(k => k !== main);
    const subs = [];
    for (let i = 0; i < nSub && pool.length; i++) {
      const k = pool.splice((Math.random() * pool.length) | 0, 1)[0];
      subs.push({ k, v: BASE_SUB[k] * rnd(0.75, 1.3) * (star === 5 ? 1.35 : star === 4 ? 1.1 : 1) });
    }
    return { id: newId(), slot, star, lv: 0, main, subs, name: itemName(slot, star) };
  }
  CT.rollItem = rollItem;

  const ITEM_ADJ = { 3: ['Cũ', 'Bạc Màu', 'Vá Víu'], 4: ['Bền', 'Thợ Rèn', 'Đi Xa'],
                     5: ['Của Trưởng Tàu', 'Bọc Bạc', 'Không Rách'] };
  function itemName(slot, star) {
    return CT.SLOT_BY_ID[slot].name + ' ' + pick(ITEM_ADJ[star]);
  }

  CT.equipItem = function (charId, itemId) {
    const c = M.chars[charId]; const it = itemById(itemId);
    if (!c || !it) return false;
    // gỡ món này khỏi bất cứ ai đang đeo nó — một món chỉ ở trên một người
    Object.keys(M.chars).forEach(cid => {
      const o = M.chars[cid];
      Object.keys(o.equip).forEach(sl => { if (o.equip[sl] === itemId) delete o.equip[sl]; });
    });
    c.equip[it.slot] = itemId;
    save(); return true;
  };
  CT.unequip = function (charId, slotId) {
    const c = M.chars[charId];
    if (!c) return false;
    delete c.equip[slotId];
    save(); return true;
  };
  CT.wearerOf = function (itemId) {
    return Object.keys(M.chars).find(cid =>
      Object.keys(M.chars[cid].equip).some(sl => M.chars[cid].equip[sl] === itemId)) || null;
  };

  CT.EQ_LV_MAX = 20;
  CT.upCost = lv => ({ gold: Math.round(500 * Math.pow(1.34, lv)) });
  CT.upgradeItem = function (itemId) {
    const it = itemById(itemId);
    if (!it || it.lv >= CT.EQ_LV_MAX) return { ok: false };
    if (!spend(CT.upCost(it.lv))) return { ok: false, reason: 'gold' };
    it.lv++;
    // mỗi 4 cấp thì một chỉ số phụ dày lên — người chơi thấy được nấc, không phải một
    // đường dốc phẳng lì
    if (it.lv % 4 === 0 && it.subs.length) {
      const s = pick(it.subs);
      s.v *= 1.28;
    }
    M.counters.upgrades++;
    save(); return { ok: true, lv: it.lv };
  };
  CT.dismantle = function (itemId) {
    const i = M.inv.findIndex(x => x.id === itemId);
    if (i < 0) return { ok: false };
    const it = M.inv[i];
    if (CT.wearerOf(itemId)) return { ok: false, reason: 'equipped' };
    M.inv.splice(i, 1);
    const back = { gold: Math.round(180 * it.star * (1 + it.lv * 0.5)), scrap: it.star };
    grant(back);
    return { ok: true, back };
  };

  // ---------------------------------------------------------------------------
  // TIẾN HOÁ
  // ---------------------------------------------------------------------------
  CT.evolCost = function (e) {
    const lv = M.evol[e.id] | 0;
    return { gold: Math.round(e.base * Math.pow(1 + e.step, lv)) };
  };
  CT.evolUp = function (id) {
    const e = CT.EVOL.find(x => x.id === id);
    if (!e) return { ok: false };
    const lv = M.evol[id] | 0;
    if (lv >= e.max) return { ok: false, reason: 'max' };
    if (!spend(CT.evolCost(e))) return { ok: false, reason: 'gold' };
    M.evol[id] = lv + 1;
    save(); return { ok: true, lv: lv + 1 };
  };

  // ---------------------------------------------------------------------------
  // TOA TÀU
  // ---------------------------------------------------------------------------
  CT.ownsCar = id => !!M.carLv[id];
  CT.buyCar = function (id) {
    const c = CT.CAR_BY_ID[id];
    if (!c || M.carLv[id]) return { ok: false };
    if (!spend({ gold: c.gold, scrap: c.scrap })) return { ok: false, reason: 'cost' };
    M.carLv[id] = 1;
    // tự lắp vào ô trống đầu tiên nếu còn chỗ
    const slot = M.cars.indexOf(null);
    if (slot >= 0) M.cars[slot] = id;
    save(); return { ok: true, slot };
  };
  CT.setCar = function (slot, id) {
    if (slot < 0 || slot >= CT.CAR_SLOTS) return false;
    if (id && !M.carLv[id]) return false;
    // một loại toa chỉ lắp một lần
    if (id) { const j = M.cars.indexOf(id); if (j >= 0 && j !== slot) M.cars[j] = null; }
    M.cars[slot] = id || null;
    save(); return true;
  };
  CT.upCar = function (id) {
    const lv = M.carLv[id];
    if (!lv || lv >= CT.CAR_LV_MAX) return { ok: false };
    if (!spend(CT.carUpCost(lv))) return { ok: false, reason: 'cost' };
    M.carLv[id] = lv + 1;
    M.counters.carUps++; M.week.carUps++;
    save(); return { ok: true, lv: lv + 1 };
  };
  // Đoàn tàu hiện tại, dạng bộ máy đọc được.
  CT.trainSpec = function () {
    const cars = [];
    let speedMul = 1, bagPlus = 0, regen = 0, wall = 0;
    M.cars.forEach((id, i) => {
      if (!id) return;
      const def = CT.CAR_BY_ID[id], lv = M.carLv[id] || 1;
      const car = { slot: i, id, def, lv };
      if (def.speedMul) speedMul *= 1 + (def.speedMul - 1) * (1 + (lv - 1) * 0.25);
      if (def.bagPlus)  bagPlus += def.bagPlus + (lv - 1);
      if (def.regen)    regen += def.regen * (1 + (lv - 1) * 0.3);
      if (def.wall)     wall = Math.max(wall, def.wall);
      if (def.turret)   car.turret = {
        dps: def.turret.dps * (1 + (lv - 1) * 0.28),
        range: def.turret.range * (1 + (lv - 1) * 0.06),
        ammoPerSec: def.turret.ammoPerSec
      };
      car.hp = Math.round(220 * (1 + (lv - 1) * 0.45) * (def.wall ? 1.8 : 1));
      cars.push(car);
    });
    const fuelSave = (M.evol.fuel | 0) * 0.012;
    return { cars, speedMul, bagPlus, regen, wall, fuelMul: 1 - fuelSave };
  };

  // ---------------------------------------------------------------------------
  // GACHA
  // ---------------------------------------------------------------------------
  // Tỉ lệ THẬT ở lượt tới, tính cả bảo hiểm mềm. Đây là con số hiện lên màn quay —
  // người chơi được thấy đúng cái xác suất họ đang chịu, không phải cái ghi trên tờ rơi.
  CT.rateNow = function (bankId) {
    const b = CT.GACHA[bankId], p = M.pity[bankId];
    if (p.c5 + 1 >= b.hard) return 1;
    const over = Math.max(0, (p.c5 + 1) - b.soft);
    return Math.min(1, b.rate5 + over * b.softStep);
  };
  CT.pityLeft = bankId => CT.GACHA[bankId].hard - M.pity[bankId].c5;

  function starFor(bankId) {
    const b = CT.GACHA[bankId], p = M.pity[bankId];
    p.c5++; p.c4++;
    if (p.c5 >= b.hard || Math.random() < CT.rateNow(bankId)) { p.c5 = 0; p.c4 = 0; return 5; }
    if (p.c4 >= b.pity4 || Math.random() < b.rate4) { p.c4 = 0; return 4; }
    return 3;
  }

  function pullChar() {
    const star = starFor('char');
    const pool = CT.CHARS.filter(c => c.star === star);
    const c = pick(pool.length ? pool : CT.CHARS);
    let dupe = false;
    if (M.chars[c.id]) {
      dupe = true;
      M.chars[c.id].shard += star === 5 ? 3 : star === 4 ? 2 : 1;
    } else {
      M.chars[c.id] = { shard: 0, skillLv: 1, equip: {} };
    }
    return { kind: 'char', star, id: c.id, name: c.name, dupe };
  }
  function pullEquip() {
    const star = starFor('equip');
    const it = rollItem(star);
    M.inv.push(it);
    return { kind: 'equip', star, id: it.id, name: it.name, item: it };
  }

  CT.pull = function (bankId, n) {
    const b = CT.GACHA[bankId];
    n = n || 1;
    const useTicket = Math.min(n, M[b.ticket] | 0);
    const gemNeed = (n - useTicket) * b.costGem;
    if (M.gem < gemNeed) return { ok: false, reason: 'gem' };
    M[b.ticket] -= useTicket;
    M.gem -= gemNeed;
    const out = [];
    for (let i = 0; i < n; i++) out.push(bankId === 'char' ? pullChar() : pullEquip());
    M.counters.pulls += n; M.day.pulls += n;
    M.spark[bankId] = (M.spark[bankId] | 0) + n;
    save(true);
    return { ok: true, results: out, ticketUsed: useTicket, gemUsed: gemNeed };
  };

  // Mốc cứng: đủ CT.SPARK lượt thì chọn thẳng một người. Không có kompu gacha ở đây —
  // kiểu "gom đủ bộ N thứ mới nhận thưởng" bị cấm hình sự ở Nhật từ 2012.
  CT.sparkPick = function (charId) {
    if ((M.spark.char | 0) < CT.SPARK) return { ok: false, reason: 'chua-du' };
    const c = CT.CHAR_BY_ID[charId];
    if (!c) return { ok: false };
    M.spark.char -= CT.SPARK;
    if (M.chars[charId]) M.chars[charId].shard += 5;
    else M.chars[charId] = { shard: 0, skillLv: 1, equip: {} };
    save(true);
    return { ok: true };
  };

  // Trùng thì nâng CHIÊU, không nâng chỉ số. Cấp 5 mở một cơ chế MỚI.
  CT.skillUpCost = charId => {
    const c = M.chars[charId];
    return c ? CT.SHARD_PER_LV : 0;
  };
  CT.skillUp = function (charId) {
    const c = M.chars[charId];
    if (!c || c.skillLv >= CT.SKILL_LV_MAX) return { ok: false, reason: 'max' };
    if (c.shard < CT.SHARD_PER_LV) return { ok: false, reason: 'shard' };
    c.shard -= CT.SHARD_PER_LV;
    c.skillLv++;
    save(); return { ok: true, lv: c.skillLv };
  };

  // Chiêu sau khi đã tính cấp và chỉ số hồi chiêu.
  CT.skillOf = function (charId) {
    const def = CT.CHAR_BY_ID[charId];
    if (!def) return null;
    const c = M.chars[charId] || { skillLv: 1 };
    const tier = CT.SKILL_LV[c.skillLv] || CT.SKILL_LV[1];
    const s = CT.statsOf(charId);
    const out = Object.assign({}, def.skill);
    out.lv = c.skillLv;
    out.cd = def.skill.cd * tier.cdMul * (1 - (s ? s.cd : 0));
    if (tier.plus) {
      if (def.skill.charges) out.charges = def.skill.charges + 1;
      else {
        if (out.range) out.range *= 1.3;
        if (out.dur)   out.dur   *= 1.3;
        if (out.dist)  out.dist  *= 1.3;
        if (out.r)     out.r     *= 1.3;
        if (out.w)     out.w     *= 1.3;
      }
    }
    out.awakened = !!tier.awaken;
    return out;
  };

  // ---------------------------------------------------------------------------
  // CỬA HÀNG — NẠP GIẢ. Không có cổng thanh toán nào ở đây.
  // ---------------------------------------------------------------------------
  CT.buyPack = function (packId) {
    const p = CT.PACKS.find(x => x.id === packId);
    if (!p) return { ok: false };
    const first = !(M.iap[packId] | 0);
    const base = p.gem + p.bonus;
    const got = first ? base * CT.FIRST_BONUS : base;
    M.iap[packId] = (M.iap[packId] | 0) + 1;
    grant({ gem: got });
    M.counters.spendVnd += p.vnd;
    save(true);
    return { ok: true, gem: got, first };
  };
  CT.packGem = function (packId) {
    const p = CT.PACKS.find(x => x.id === packId);
    if (!p) return 0;
    const first = !(M.iap[packId] | 0);
    return (p.gem + p.bonus) * (first ? CT.FIRST_BONUS : 1);
  };
  CT.packFirst = packId => !(M.iap[packId] | 0);

  function rollShopDay() {
    if (M.shopLimit.day !== dayIndex()) { M.shopLimit.day = dayIndex(); M.shopLimit.used = {}; }
  }
  CT.exchangeLeft = function (x) {
    rollShopDay();
    return x.limit - (M.shopLimit.used[x.id] | 0);
  };
  CT.exchange = function (xid) {
    const x = CT.EXCHANGE.find(e => e.id === xid);
    if (!x) return { ok: false };
    if (CT.exchangeLeft(x) <= 0) return { ok: false, reason: 'het-luot' };
    if (!spend({ gem: x.gem })) return { ok: false, reason: 'gem' };
    const g = {};
    WALLET.forEach(k => { if (x[k]) g[k] = x[k]; });
    grant(g);
    M.shopLimit.used[x.id] = (M.shopLimit.used[x.id] | 0) + 1;
    save();
    return { ok: true, got: g };
  };

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ
  // ---------------------------------------------------------------------------
  function rollQuests() {
    const d = dayIndex(), w = weekIndex();
    if (M.quests.day !== d) {
      M.quests.day = d;
      M.quests.daily = shuffle(CT.QUESTS.daily.map(q => q.id)).slice(0, 4);
      CT.QUESTS.daily.forEach(q => { delete M.quests.claimed[q.id]; });
      M.day = { runs: 0, loot: 0, kills: 0, legs: 0, skills: 0, pulls: 0, coal: 0 };
    }
    if (M.quests.week !== w) {
      M.quests.week = w;
      M.quests.weekly = CT.QUESTS.weekly.map(q => q.id);
      CT.QUESTS.weekly.forEach(q => { delete M.quests.claimed[q.id]; });
      M.week = { runs: 0, wins: 0, loot: 0, kills: 0, carUps: 0 };
    }
  }
  CT.rollQuests = rollQuests;
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function counterValue(key, scope) {
    if (scope === 'day') return M.day[key] | 0;
    if (scope === 'week') return M.week[key] | 0;
    // thành tựu
    if (key === 'mapsDone') return CT.MAPS.filter(m => M.maps[m.id] && M.maps[m.id].cleared).length;
    if (key === 'own5')     return Object.keys(M.chars).filter(id => CT.CHAR_BY_ID[id].star === 5).length;
    if (key === 'ownAll')   return Object.keys(M.chars).length;
    if (key === 'skillMax') return Object.keys(M.chars).filter(id => M.chars[id].skillLv >= CT.SKILL_LV_MAX).length;
    if (key === 'carsFull') return M.cars.filter(Boolean).length;
    return M.counters[key] | 0;
  }
  CT.counterValue = counterValue;

  CT.questList = function () {
    rollQuests();
    const out = { daily: [], weekly: [], ach: [] };
    M.quests.daily.forEach(id => {
      const q = CT.QUESTS.daily.find(x => x.id === id);
      if (q) out.daily.push(withProgress(q, 'day'));
    });
    M.quests.weekly.forEach(id => {
      const q = CT.QUESTS.weekly.find(x => x.id === id);
      if (q) out.weekly.push(withProgress(q, 'week'));
    });
    CT.ACHS.forEach(a => {
      const have = counterValue(a.counter, 'ach');
      out.ach.push(Object.assign({}, a, { have, done: have >= a.need,
                                          claimed: !!M.quests.achClaimed[a.id] }));
    });
    return out;
  };
  function withProgress(q, scope) {
    const have = counterValue(q.counter, scope);
    return Object.assign({}, q, { have, done: have >= q.need, claimed: !!M.quests.claimed[q.id] });
  }

  CT.claimQuest = function (id, isAch) {
    if (isAch) {
      const a = CT.ACHS.find(x => x.id === id);
      if (!a || M.quests.achClaimed[id]) return { ok: false };
      if (counterValue(a.counter, 'ach') < a.need) return { ok: false, reason: 'chua-du' };
      M.quests.achClaimed[id] = 1; grant(a.r); save();
      return { ok: true, r: a.r };
    }
    const all = CT.QUESTS.daily.concat(CT.QUESTS.weekly);
    const q = all.find(x => x.id === id);
    if (!q || M.quests.claimed[id]) return { ok: false };
    const scope = CT.QUESTS.daily.some(x => x.id === id) ? 'day' : 'week';
    if (counterValue(q.counter, scope) < q.need) return { ok: false, reason: 'chua-du' };
    M.quests.claimed[id] = 1; grant(q.r); save();
    return { ok: true, r: q.r };
  };

  // ---------------------------------------------------------------------------
  // CỬA DUY NHẤT MÀ MỘT VÁN CHẠM VÀO VÍ
  // ---------------------------------------------------------------------------
  // `res` do game.js dựng: { won, mapId, legs, km, loot, kills, skills, coal, scrap, gold }
  CT.finishRun = function (res) {
    rollQuests();
    const map = CT.MAP_BY_ID[res.mapId];
    const st = M.maps[res.mapId] || (M.maps[res.mapId] = { leg: 0, cleared: false, best: 0 });

    M.counters.runs++;  M.day.runs++;  M.week.runs++;
    M.counters.legs   += res.legs   | 0; M.day.legs   += res.legs   | 0;
    M.counters.kills  += res.kills  | 0; M.day.kills  += res.kills  | 0; M.week.kills += res.kills | 0;
    M.counters.skills += res.skills | 0; M.day.skills += res.skills | 0;
    M.counters.coal   += res.coal   | 0; M.day.coal   += res.coal   | 0;
    M.counters.km     += Math.round(res.km || 0);
    M.counters.loot   += res.loot   | 0; M.day.loot   += res.loot   | 0; M.week.loot  += res.loot | 0;

    if (res.legs > st.leg) st.leg = res.legs;
    if (res.loot > st.best) st.best = res.loot;

    // Thưởng: vàng bán đồ + phế liệu nhặt được. Thua thì vẫn được phần đã mang về
    // TỚI GA GẦN NHẤT — nhưng mất phần đang cầm trên tay lúc chết.
    const reward = { gold: Math.round(res.gold || 0), scrap: res.scrap | 0 };
    if (res.won) {
      M.counters.wins++; M.week.wins++;
      const first = !st.cleared;
      st.cleared = true;
      const bonus = first ? map.first : map.clear;
      WALLET.forEach(k => { if (bonus[k]) reward[k] = (reward[k] || 0) + bonus[k]; });
      reward.first = first;
    }
    grant(reward);
    save(true);
    return reward;
  };

  // ---------------------------------------------------------------------------
  // MỞ MAP: map kế tiếp mở ra khi map trước đã phá đảo. Map đầu luôn mở.
  // ---------------------------------------------------------------------------
  CT.mapOpen = function (mapId) {
    const i = CT.MAPS.findIndex(m => m.id === mapId);
    if (i <= 0) return true;
    const prev = CT.MAPS[i - 1];
    return !!(M.maps[prev.id] && M.maps[prev.id].cleared);
  };

  CT.charList = function () {
    return CT.CHARS.filter(c => M.chars[c.id]).map(c => Object.assign({}, c, M.chars[c.id]));
  };

})(window);
