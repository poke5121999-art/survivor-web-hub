// Progress outside the match: coins, experience, level, unlocked units. Saved in localStorage.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const KEY = 'phaomay.save.v1';
  PM.UNIT_PRICE = { coc: 0, chuon: 300, oc: 450, tegiac: 600 };
  PM.RANKS = ['Tân Binh', 'Pháo Thủ', 'Xạ Thủ', 'Đội Trưởng', 'Chỉ Huy', 'Thống Lĩnh Mây'];

  PM.Meta = function (G) {
    const fresh = () => ({ coins: 0, xp: 0, units: ['coc'], wins: 0, losses: 0, last: { unit: 'coc', size: 1, ai: 'easy', map: 'doiche' } });
    let save = Object.assign(fresh(), PM.store.read(KEY, {}));
    if (!Array.isArray(save.units) || !save.units.includes('coc')) save.units = ['coc'];
    const api = { get save() { return save; } };
    api.commit = () => PM.store.write(KEY, save);
    api.level = (xp) => Math.floor(Math.sqrt((xp === undefined ? save.xp : xp) / 120)) + 1;
    api.levelSpan = (lv) => ({ from: 120 * (lv - 1) * (lv - 1), to: 120 * lv * lv });
    api.rank = (lv) => PM.RANKS[Math.min(PM.RANKS.length - 1, Math.floor(((lv === undefined ? api.level() : lv) - 1) / 3))];
    api.owns = (kind) => save.units.includes(kind);
    api.buy = function (kind) {
      const price = PM.UNIT_PRICE[kind];
      if (price === undefined || api.owns(kind) || save.coins < price) return false;
      save.coins -= price; save.units.push(kind); api.commit();
      return true;
    };
    // Rewards for the player's team once a match ends.
    api.reward = function (sim, team, level) {
      const mult = { easy: 0.7, medium: 1, hard: 1.5 }[level] || 1;
      let dealt = 0, kills = 0;
      for (const u of sim.units) if (u.team === team && !u.ai) { dealt += sim.stats[u.id].dealt; kills += sim.stats[u.id].kills; }
      const win = sim.winner === team;
      const coins = Math.round((25 + dealt / 22 + kills * 30 + (win ? 70 : 0)) * mult);
      const xp = Math.round((30 + dealt / 14 + kills * 25 + (win ? 60 : 0)) * mult);
      const before = api.level();
      save.coins += coins; save.xp += xp; if (win) save.wins++; else save.losses++;
      api.commit();
      return { coins, xp, win, dealt, kills, levelUp: api.level() > before, level: api.level() };
    };
    api.reset = () => { save = fresh(); api.commit(); };
    return api;
  };
})();
