// Meta progression: save state, gold, sword / helmet upgrades, stage unlocks, boosters, HARD / HELL. Every number comes from data/meta.json,
// which records the C++ function + address it was recovered from (see its _note). Pure logic, no DOM.
//
// Save lives in this browser only (localStorage, key ds.save.v1); reads and writes never throw.

const KEY = 'ds.save.v1';


// a stored save can be from an older build, half-written or hand-edited: keep only fields of the right shape so a bad
// save can never stop the game (it then starts from what is valid, or fresh)
function cleanSave(o, f) {
  const out = { ...f };
  if (!o || typeof o !== 'object') return out;
  const int = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : d);
  out.gold = int(o.gold, 0, 1e9, f.gold);
  out.wlv = int(o.wlv, 0, 9, f.wlv);
  out.alv = int(o.alv, 0, 9, f.alv);
  out.stages = {};
  if (o.stages && typeof o.stages === 'object') {
    for (const [id, r] of Object.entries(o.stages)) {
      if (!r || typeof r !== 'object') continue;
      const e = { cleared: !!r.cleared, stars: int(r.stars, 0, 3, 0), best: int(r.best, 0, 1e9, 0) };
      if (r.table !== undefined) e.table = int(r.table, 0, 9, 0);
      if (Array.isArray(r.untouched)) e.untouched = [0, 1, 2].map(i => !!r.untouched[i]);
      out.stages[id] = e;
    }
  }
  if (f.boosters) {
    out.boosters = { ...f.boosters };
    if (o.boosters && typeof o.boosters === 'object') for (const k of Object.keys(f.boosters)) out.boosters[k] = int(o.boosters[k], 0, 999, 0);
    out.gift = !!o.gift;
  }
  return out;
}

export function createMeta(meta, stageIds, storage) {
  const st = storage || (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const fresh = () => ({
    gold: meta.startGold.value, wlv: meta.upgrade.startLevel.value, alv: meta.upgrade.startLevel.value, stages: {},
    boosters: { potion: 0, sword: 0, shield: 0, relic: 0 }, gift: false,
  });
  let save = fresh();
  try {
    const raw = st && st.getItem(KEY);
    if (raw) save = cleanSave(JSON.parse(raw), fresh());
  } catch (e) { /* storage blocked or corrupt: start fresh */ }

  const persist = () => { try { if (st) st.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } };
  const U = meta.upgrade;
  const maxLv = U.maxLevel.value;
  const K = meta.knightStats;
  const ITEMS = meta.boosters.items.value;
  const GIFT = meta.boosters.freeGift.value;
  const MODES = meta.difficulty.modes.value;
  const CH = meta.difficulty.challenges.value;
  // per stage: star table = max over clears of mode*3 + stars (GameData+0x4f88), UNTOUCHED per mode (+0x5758 + mode*0x7d0)
  const rec = id => {
    const r = save.stages[id] || {};
    return { cleared: !!r.cleared, stars: r.stars || 0, best: r.best || 0, table: Math.max(r.table || 0, r.stars || 0), untouched: r.untouched || [false, false, false] };
  };

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
    stageInfo: rec,
    // ---- difficulty (data/meta.json difficulty) ----
    modes: MODES,
    modeOpen(id, mode) {
      const r = rec(id);
      if (mode === 0) return true;
      if (mode === 1) return r.table >= CH.hardNeeds && r.untouched[0];
      return r.table >= CH.hellNeeds && r.untouched[1];
    },
    // the prep picks the highest open mode (Scene_WorldMap::onTouchesEnded @0x56f940)
    defaultMode: id => (api.modeOpen(id, 2) ? 2 : api.modeOpen(id, 1) ? 1 : 0),
    modeStars: (id, mode) => Math.max(0, Math.min(3, rec(id).table - CH.starTableStep * mode)),
    allHell: id => rec(id).table >= CH.allNeeds && rec(id).untouched[2],
    // stage settings for a run in this mode: monster ATK / walk multipliers and the coin value
    modeSettings(id, mode) {
      const m = MODES[mode];
      return { mode, atkMul: m.atkMul, walkMul: m.walkMul, coin: mode === 2 && api.allHell(id) ? m.coinAll : m.coin };
    },
    modeLabel: (id, mode) => (mode === 2 && api.allHell(id) ? MODES[2].labelAll : MODES[mode].label),
    // ---- boosters (data/meta.json boosters) ----
    items: ITEMS,
    owned: key => save.boosters[key] || 0,
    boosterRowOpen: () => rec(stageIds[GIFT.afterStage - 1]).cleared,
    // the free gift: once, when stage 4 has stars and stage 5 none (Scene_WorldMap::Call_Back_Top_Star @0x55ce44)
    claimGift() {
      if (save.gift || rec(stageIds[GIFT.afterStage - 1]).table < 1 || rec(stageIds[GIFT.afterStage]).table > 0) return false;
      for (const k of GIFT.items) save.boosters[k] = (save.boosters[k] || 0) + GIFT.each;
      save.gift = true;
      persist();
      return true;
    },
    // Call_Back_Buy_Booster_Item @0x567a14: one at a time here (the original also lets you pick a quantity)
    buyBooster(key) {
      const it = ITEMS.find(i => i.key === key);
      if (!it || it.notBuilt) return 'notbuilt';
      if (save.gold < it.price) return 'gold';
      save.gold -= it.price;
      save.boosters[key] = (save.boosters[key] || 0) + 1;
      persist();
      return 'ok';
    },
    // what a stage carries in: min(owned, cap) (Scene_Stage::Init_Data @0x5760cc)
    stageBoosters() {
      const cap = k => ITEMS.find(i => i.key === k).stageCap;
      return { potions: Math.min(api.owned('potion'), cap('potion')), shields: Math.min(api.owned('shield'), cap('shield')), storms: Math.min(api.owned('sword'), cap('sword')) };
    },
    // using one in a stage spends the owned booster at once (SaveBoosterItemAndDestiny after each use)
    spendBooster(key) { save.boosters[key] = Math.max(0, (save.boosters[key] || 0) - 1); persist(); },
    // clearing stage N unlocks N+1 (clip c2 5:20; see meta.stages.unlockRule)
    unlocked: id => {
      const i = stageIds.indexOf(id);
      return i === 0 || (i > 0 && api.stageInfo(stageIds[i - 1]).cleared);
    },
    // highest cleared stage index (-1 if none): where the hero stands on the map
    lastCleared: () => stageIds.reduce((m, id, i) => (api.stageInfo(id).cleared ? i : m), -1),
    // bank a finished run: coins picked up are kept on clear and on fail; stars / best / challenges only on clear.
    // stars = NORMAL stars; table = mode*3 + stars kept at its max; untouched[mode] after a clear with no damage taken
    finishRun(id, { cleared, stars, score, gold, mode = 0, untouched = false }) {
      save.gold += gold;
      const cur = rec(id);
      const ut = cur.untouched.slice();
      if (cleared && untouched) ut[mode] = true;
      save.stages[id] = {
        cleared: cur.cleared || cleared,
        stars: Math.max(cur.stars, cleared && mode === 0 ? stars : 0),
        best: Math.max(cur.best, score),
        table: Math.max(cur.table, cleared && stars > 0 ? mode * CH.starTableStep + stars : 0),
        untouched: ut,
      };
      persist();
    },
    reset() { save = fresh(); persist(); },
    // test hook: replace the save wholesale
    load(s) { save = cleanSave(s, fresh()); persist(); },
  };
  return api;
}
