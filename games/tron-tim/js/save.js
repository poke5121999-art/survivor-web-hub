// Lưu cục bộ + kinh tế của game gốc (D:\phanminhtam-ref\notes\meta.md mục 3, 5; ResultMenu.cs:47-141). Mọi thao tác localStorage bọc try/catch.
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const KEY = 'tron-tim.save.v1';

  // 3.2, 3.3, 5.1 (số gốc)
  const ECON = {
    ENERGY_MAX: 100, ENERGY_COST: 20, ENERGY_PER_SEC: 1 / 30,        // +2 mỗi phút
    ENERGY_PRICE: 1000, ENERGY_GIFT: 50,
    GOLD: 50, GOLD_BONUS: 25, EXP: 50, EXP_BONUS: 25, CUP_WIN: 10, CUP_LOSE: 5, EXP_LOSE: 50,
    TIME_CONST: 390, LEVEL_GOLD: 100, LEVEL_GOLD_5: 150, ONLINE_LEVEL: 5
  };
  // 5.2: [vai trò đếm, số cần, vàng, cúp]
  const QUESTS = [
    { id: 'first_game', stat: 'match', need: 1, gold: 150, cup: 0, vi: ['Ván đầu trong ngày', 'Chơi 1 trận'], en: ['First Game Of Day', 'Play 1 match'] },
    { id: 'first_win', stat: 'win', need: 1, gold: 150, cup: 1, vi: ['Thắng đầu trong ngày', 'Thắng 1 trận'], en: ['First Win Of Day', 'Win 1 match'] },
    { id: 'trophies', stat: 'match', need: 5, gold: 100, cup: 5, vi: ['Thu thập huy hiệu', 'Chơi 5 trận'], en: ['Collect Trophies', 'Play 5 matches'] },
    { id: 'coins', stat: 'win', need: 3, gold: 200, cup: 2, vi: ['Thu thập vàng', 'Thắng 3 trận'], en: ['Collect Gold Coins', 'Win 3 matches'] }
  ];

  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const fresh = () => ({
    v: 1, name: 'Bạn', lang: 'vi', level: 1, exp: 0, gold: 0, cup: 0, energy: ECON.ENERGY_MAX, energyAt: Date.now(),
    stats: { match: 0, finish: 0, win: 0, hideWin: 0, seekWin: 0, losing: 0 },
    daily: { date: today(), match: 0, win: 0, claimed: [false, false, false, false], total: false },
    settings: { music: 1, sfx: 1, vib: 1, quality: 2 },
    hero: { hide: null, seek: null }
  });

  function merge(dst, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') merge(dst[k], src[k]);
      else if (typeof src[k] === typeof dst[k] || dst[k] === null) dst[k] = src[k];
    }
    return dst;
  }

  const S = TT.save = { ECON, QUESTS, d: fresh(), memoryOnly: false };

  S.load = function () {
    S.d = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) merge(S.d, JSON.parse(raw));
    } catch (e) { S.memoryOnly = true; }
    S.rollDay(); S.regen();
    return S.d;
  };

  S.persist = function () {
    try { localStorage.setItem(KEY, JSON.stringify(S.d)); } catch (e) { S.memoryOnly = true; }
  };

  // ---- năng lượng: +1/30 mỗi giây, cả lúc đóng trang (InventoryManager.cs:51-57, 117-128)
  S.regen = function (now) {
    const d = S.d; now = now || Date.now();
    if (d.energy >= ECON.ENERGY_MAX) { d.energy = ECON.ENERGY_MAX; d.energyAt = now; return; }
    const dt = Math.max(0, (now - d.energyAt) / 1000);
    d.energy = Math.min(ECON.ENERGY_MAX, d.energy + dt * ECON.ENERGY_PER_SEC);
    d.energyAt = now;
  };
  S.energy = () => Math.floor(S.d.energy + 1e-9);
  S.canPlay = () => { S.regen(); return S.d.energy >= ECON.ENERGY_COST; };
  S.spendEnergy = function () {
    S.regen();
    if (S.d.energy < ECON.ENERGY_COST) return false;
    S.d.energy -= ECON.ENERGY_COST;
    S.persist(); return true;
  };
  // BuyEnergy (InventoryManager.cs:177-224): chỉ khi energy < 100 và gold >= 1000
  S.buyEnergy = function () {
    S.regen();
    if (S.d.energy >= ECON.ENERGY_MAX) return 'full';
    if (S.d.gold < ECON.ENERGY_PRICE) return 'poor';
    S.d.gold -= ECON.ENERGY_PRICE;
    S.d.energy = Math.min(ECON.ENERGY_MAX, S.d.energy + ECON.ENERGY_GIFT);
    S.persist(); return 'ok';
  };

  // ---- cấp độ: 52.5 * L exp để rời cấp L (ResultMenu.cs:51)
  S.expNeed = L => L * 50 + L * 0.1 * 25;
  S.expFrac = () => Math.min(1, S.d.exp / S.expNeed(S.d.level));

  // ---- nhiệm vụ ngày (StatusPlayer.cs:208-234, 323-339)
  S.rollDay = function () {
    const d = S.d.daily, t = today();
    if (d.date !== t) { d.date = t; d.match = 0; d.win = 0; d.claimed = [false, false, false, false]; d.total = false; S.persist(); }
  };
  S.questProgress = i => Math.min(QUESTS[i].need, S.d.daily[QUESTS[i].stat]);
  S.questDone = i => S.d.daily[QUESTS[i].stat] >= QUESTS[i].need;
  S.questsClaimed = () => S.d.daily.claimed.filter(Boolean).length;
  S.claimQuest = function (i) {
    const q = QUESTS[i], d = S.d.daily;
    if (!S.questDone(i) || d.claimed[i]) return null;
    d.claimed[i] = true; S.d.gold += q.gold; S.d.cup += q.cup; S.persist();
    return { gold: q.gold, cup: q.cup };
  };
  // QuestManager.cs:116-138: rương tổng 4 nhiệm vụ = Random(100,1000) vàng + Random(1,10) cúp
  S.claimTotal = function (rnd) {
    const d = S.d.daily; rnd = rnd || Math.random;
    if (S.questsClaimed() < 4 || d.total) return null;
    d.total = true;
    const gold = 100 + Math.floor(rnd() * 900), cup = 1 + Math.floor(rnd() * 9);
    S.d.gold += gold; S.d.cup += cup; S.persist();
    return { gold, cup };
  };

  // ---- kết trận (ResultMenu.cs:47-141). clock = giờ còn lại của đồng hồ 150 s (currentMatchTime), làm tròn lên số giây nguyên như game gốc đếm.
  // Thắng: gold = int(50 + (390 - t)/10 + 25), exp 75, cúp +10. Thua: gold = int(50 + (390 - t)/10), exp 50, cúp +5.
  S.settle = function (win, role, clock) {
    const d = S.d, E = ECON;
    S.rollDay();
    const t = Math.ceil(clock - 1e-9);
    const base = Math.trunc(E.GOLD + (E.TIME_CONST - t) / 10);
    const r = { win, role, clock: t, level0: d.level, exp0: d.exp, levelUp: false, levelGold: 0 };
    r.gold = win ? Math.trunc(E.GOLD + (E.TIME_CONST - t) / 10 + E.GOLD_BONUS) : base;
    r.exp = win ? E.EXP + E.EXP_BONUS : E.EXP_LOSE;
    r.cup = win ? E.CUP_WIN : E.CUP_LOSE;
    d.stats.match++; d.stats.finish++; d.daily.match++;
    if (win) {
      d.daily.win++; d.stats.win++; d.stats.losing = 0;
      if (role === 'hide') d.stats.hideWin++; else d.stats.seekWin++;
    } else d.stats.losing++;
    d.gold += r.gold; d.cup += r.cup;
    const need = S.expNeed(d.level);
    d.exp += r.exp;
    if (d.exp >= need) {                       // một lần lên cấp mỗi trận, phần dư giữ lại
      d.exp -= need; d.level++; r.levelUp = true;
      r.levelGold = d.level % 5 > 0 ? E.LEVEL_GOLD : E.LEVEL_GOLD_5; d.gold += r.levelGold;
    }
    r.level1 = d.level; r.exp1 = d.exp; r.frac = S.expFrac();
    S.persist();
    return r;
  };

  S.setSetting = function (k, v) { S.d.settings[k] = v; S.persist(); };
  S.setLang = function (l) { S.d.lang = l; S.persist(); };
  S.setHero = function (role, hero) { S.d.hero[role] = hero; S.persist(); };

  S.load();
  addEventListener('pagehide', () => { S.regen(); S.persist(); });
})();
