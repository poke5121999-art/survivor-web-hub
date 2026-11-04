// Meta progression: save state, gold, sword / helmet upgrades, stage unlocks. Every number comes from data/meta.json,
// which records the C++ function + address it was recovered from (see its _note). Pure logic, no DOM.
//
// Save lives in this browser only (localStorage, key ds.save.v1); reads and writes never throw.

const KEY = 'ds.save.v1';

export function createMeta(meta, stageIds, storage) {
  const st = storage || (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const fresh = () => ({ gold: meta.startGold.value, wlv: meta.upgrade.startLevel.value, alv: meta.upgrade.startLevel.value, stages: {} });
  let save = fresh();
  try {
    const raw = st && st.getItem(KEY);
    if (raw) save = { ...fresh(), ...JSON.parse(raw) };
  } catch (e) { /* storage blocked or corrupt: start fresh */ }

  const persist = () => { try { if (st) st.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } };
  const U = meta.upgrade;
  const maxLv = U.maxLevel.value;
  const K = meta.knightStats;

  const api = {
    get save() { return save; },
    stageIds,
    gold: () => save.gold,
    level: kind => (kind === 'weapon' ? save.wlv : save.alv),
    // what the card shows: the level it buys ("Lv.%d" with level + 2 in FUC_SET_FONT) and its price
    nextLabel: kind => api.level(kind) + 2,
    price: kind => (api.level(kind) >= maxLv ? null : U[kind].priceByLevel[api.level(kind)]),
    isMax: kind => api.level(kind) >= maxLv,
    // Call_Back_Upgrade_Weapon / _Armor: max -> refuse, gold < price -> refuse, else pay and level up
    upgrade(kind) {
      if (api.isMax(kind)) return 'max';
      const p = api.price(kind);
      if (save.gold < p) return 'gold';
      save.gold -= p;
      if (kind === 'weapon') save.wlv++; else save.alv++;
      persist();
      return 'ok';
    },
    tiers: () => ({ armor: meta.levelToTier.value[save.alv], sword: meta.levelToTier.value[save.wlv] }),
    stats: () => ({
      atk: K.atkByWeaponLevel.value[save.wlv],
      // player+0x540: shown as CRIT in Drop 1, really the dash skill's power (Scene_Stage::update @0x591a28)
      skill: K.critByWeaponLevel.value[save.wlv],
      crit: K.critByWeaponLevel.value[save.wlv],
      wlv: save.wlv,
      def: K.defByArmorLevel.value[save.alv],
      hp: K.hpByArmorLevel.value[save.alv],
    }),
    stageInfo: id => save.stages[id] || { stars: 0, best: 0, cleared: false },
    // clearing stage N unlocks N+1 (clip c2 5:20; see meta.stages.unlockRule)
    unlocked: id => {
      const i = stageIds.indexOf(id);
      return i === 0 || (i > 0 && api.stageInfo(stageIds[i - 1]).cleared);
    },
    // highest cleared stage index (-1 if none): where the hero stands on the map
    lastCleared: () => stageIds.reduce((m, id, i) => (api.stageInfo(id).cleared ? i : m), -1),
    // bank a finished run: coins picked up are kept on clear and on fail; stars / best only on clear
    finishRun(id, { cleared, stars, score, gold }) {
      save.gold += gold;
      const cur = api.stageInfo(id);
      save.stages[id] = {
        cleared: cur.cleared || cleared,
        stars: Math.max(cur.stars, cleared ? stars : 0),
        best: Math.max(cur.best, score),
      };
      persist();
    },
    reset() { save = fresh(); persist(); },
    // test hook: replace the save wholesale
    load(s) { save = { ...fresh(), ...s }; persist(); },
  };
  return api;
}
