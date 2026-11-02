// Feature "theme" (sim part): facility skins, level-sign skins, forest themes and lamps. Contract: js/sim/registry.js.
// Rules and citations: D:/catsoup-ref/rules/theme.md. Tables: WorkSkin, SignSkin, Theme, Lamp, Work (data/tables.json) and
// data/theme.json (ground textures per theme, ThemeShop / ThemeSpecial rows, the skin recipes of tools/export_theme.py).
//
// State game.state.theme:
//   themes [..]   owned forest themes (GameData.ltThemeList; theme 0 is the free one)
//   theme         forest theme in use (DataManager.GetThemeType / SaveThemeType)
//   skins  [..]   owned WorkSkin indices (ownWorkSkins; every HowAquire Always row is owned: DataManager.ValidOwnSkin)
//   signs  [..]   owned SignSkin indices (ownSignSkins)
//   lamps  [..]   owned lamp indices (ltLampList; lamp 0 counts as owned: WorksWorker.IsOwnLamp)
//   lampType      lamp last chosen for every facility (DataManager.GetLampType / SaveLampType)
//   work { <work id>: { skin, sign, lamp } }  what each facility wears (WorkData.EquipedWorkSkin / EquipedSignSkin / EquipedLamp)
//   money { <theme_type>: n }  special theme money (ThemeSpecial.goodsRewardType 8001 / 8002)
//   shopBuy { <ThemeShop index>: times }
// Events: skin {work, skin}, sign {work, sign}, lamp {lamp, all}, themeSet {theme}, themeBuy {theme}, skinBuy {work, skin},
// themeShop {row}. Reward types handled here: 14 lamp, 22 theme, 26 work skin, 27 sign skin, 8001 / 8002 special theme money.

export const HOW = { ALWAYS: 0, LV: 1, PLAYPOINT: 2, GEM: 3, EVENT: 4, PACKAGE: 5, CATGIFT: 6, MONTHLY: 7, RECOMMEND: 8, SEASON_DAILY: 9, COIN: 10, STAMP: 11, DAILY_DAY: 12, SUBGAME: 13 };
export const COST_GEM = 3;                  // Theme.costType 3 = gems (reward type 3), as in ThemeAqua
export const NO_SKIN_TYPES = [11, 12];      // WorkWorker.EquipWorkSkin refuses Work.type 11 and 12 (WorkWorker.c:EquipWorkSkin `1 < type - 11`)
const MONEY_TYPES = { 8001: 1, 8002: 2 };   // ThemeSpecial.goodsRewardType -> Theme.theme_type

const S = g => g.state.theme;
const memo = (g, key, build) => (g[key] ||= build());
const skinMap = g => memo(g, '_thSkin', () => new Map(g.t.WorkSkin.map(r => [r.index, r])));
const signMap = g => memo(g, '_thSign', () => new Map(g.t.SignSkin.map(r => [r.index, r])));
const lampMap = g => memo(g, '_thLamp', () => new Map(g.t.Lamp.map(r => [r.index, r])));
const themeMap = g => memo(g, '_thTheme', () => new Map(g.t.Theme.map(r => [r.index, r])));
const addOnce = (list, v) => { if (list.includes(v)) return false; list.push(v); return true; };

export const skinRow = (g, i) => skinMap(g).get(i);
export const signRow = (g, i) => signMap(g).get(i);
export const lampRow = (g, i) => lampMap(g).get(i);
export const themeRow = (g, i) => themeMap(g).get(i);
export const specialRow = (g, themeType) => (g.data.theme.special || []).find(r => r.theme_type === themeType);
const allWorks = g => [...g.state.works, ...(g.state.storage || [])];

// ---- ownership (DataManager.Add*, WorksWorker.AddSkin / AddSkinLamp / IsOwn*) ----
export function addSkin(g, i) {
  if (!skinRow(g, i) || !addOnce(S(g).skins, i)) return false;
  g.emit('skinGet', { skin: i });
  return true;
}
export function addSign(g, i) {
  if (!signRow(g, i) || !addOnce(S(g).signs, i)) return false;
  g.emit('signGet', { sign: i });
  return true;
}
export function addLamp(g, i) {           // WorksWorker.AddSkinLamp: index 0 is never added (always owned)
  if (!i || !lampRow(g, i) || !addOnce(S(g).lamps, i)) return false;
  g.emit('lampGet', { lamp: i });
  return true;
}
export function addTheme(g, i) {
  if (!themeRow(g, i) || !addOnce(S(g).themes, i)) return false;
  g.emit('themeGet', { theme: i });
  return true;
}
export const ownSkin = (g, i) => S(g).skins.includes(i);
export const ownSign = (g, i) => S(g).signs.includes(i);
export const ownLamp = (g, i) => i === 0 || S(g).lamps.includes(i);
export const ownTheme = (g, i) => S(g).themes.includes(i);

// ---- what a facility wears ----
export function rec(g, w) {
  const t = S(g);
  return (t.work[w.id] ||= { skin: 0, sign: 0, lamp: hasLamp(g, w) ? t.lampType : 0 });
}
export const skinOf = (g, w) => rec(g, w).skin;
export const signOf = (g, w) => rec(g, w).sign;
export const lampOf = (g, w) => rec(g, w).lamp;
export const hasLamp = (g, w) => !!g.work.get(w.a).haveLamp;
// Work.get_BaseTile: the equipped skin's BaseTile when it is not -1, else Work.baseTile (map.md 2a).
export function baseTile(g, w) {
  const a = g.work.get(w.a);
  const s = skinRow(g, skinOf(g, w));
  return s && s.BaseTile !== -1 ? s.BaseTile : a.baseTile;
}

// ---- facility skins (WorkSkin.json, Work.existWorkSkins) ----
// One entry per skin the facility can wear, in the order of Work.existWorkSkins (that order is the skin position every
// WorkPlaceInfo array is indexed by). `listed` follows ExposePeriodKind: Always / Shop_Package rows show even when not
// owned (locked), Possession / Event / Period rows only once owned, Never never (inferred from the enum names).
export function skinList(g, w) {
  const a = g.work.get(w.a);
  const cur = skinOf(g, w);
  return a.existWorkSkins.map((index, pos) => {
    const r = skinRow(g, index);
    const own = ownSkin(g, index);
    const how = r.howAquire;
    const listed = own || r.exposePeriod === 0 || r.exposePeriod === 4;
    const gems = how === HOW.GEM ? r.howAquire_Value : 0;
    const coin = how === HOW.COIN ? r.howAquire_Value : 0;
    return { index, pos, row: r, own, how, listed, equipped: cur === index, buyable: !own && (how === HOW.GEM || how === HOW.COIN), gems, coin,
      realMoney: !own && how === HOW.PACKAGE };
  }).filter(x => x.listed);
}

export function equipSkin(g, w, index) {
  const a = g.work.get(w.a);
  if (NO_SKIN_TYPES.includes(a.type) || !a.existWorkSkins.includes(index) || !ownSkin(g, index)) return false;
  const r = rec(g, w);
  if (r.skin === index) return false;
  const before = baseTile(g, w);
  r.skin = index;
  g.emit('skin', { work: w, skin: index, tileChanged: before !== baseTile(g, w) });
  return true;
}

// UI_Facility.SelectDeco: a Gem / Coin skin is bought with howAquire_Value of that currency; the other kinds (Package is real
// money, Event, MonthlyPass, StampRally ...) are not sold here.
export function buySkin(g, w, index) {
  const x = skinList(g, w).find(s => s.index === index);
  if (!x || !x.buyable) return false;
  if (x.gems) { if (g.state.gem < x.gems) return false; g.state.gem -= x.gems; }
  else if (x.coin) { if (g.state.coin < x.coin) return false; g.state.coin -= x.coin; }
  addSkin(g, index);
  g.emit('skinBuy', { work: w, skin: index });
  return true;
}

// ---- level-sign skins (SignSkin.json). WorkWorker.DisplayEquipedSignSkin passes an empty SkinObjects (Mode 0), so a sign skin
// changes nothing on screen; the choice is still stored. ----
export function signList(g, w) {
  const a = g.work.get(w.a);
  const cur = signOf(g, w);
  return a.existSignSkins.map(index => {
    const r = signRow(g, index);
    const own = ownSign(g, index);
    return { index, row: r, own, equipped: cur === index, listed: own || r.exposePeriod === 0 || r.exposePeriod === 4, how: r.howAquire,
      lv: r.howAquire === HOW.LV ? r.howAquire_Value : 0 };
  }).filter(x => x.listed);
}
export function equipSign(g, w, index) {
  const a = g.work.get(w.a);
  if (!a.existSignSkins.includes(index) || !ownSign(g, index)) return false;
  const r = rec(g, w);
  if (r.sign === index) return false;
  r.sign = index;
  g.emit('sign', { work: w, sign: index });
  return true;
}

// ---- lamps (Lamp.json) ----
// UI_Theme.OnStartUI: the owned lamps sorted ascending. cost -1 rows are event / package lamps and cannot be bought.
export function lampList(g) {
  const t = S(g);
  return [...new Set([0, ...t.lamps])].sort((x, y) => x - y);
}
export const lampCatalog = g => g.t.Lamp.map(r => ({ index: r.index, row: r, own: ownLamp(g, r.index), buyable: false }));

// WorkWorker.EquipLampSkin: one facility, owned lamps only.
export function equipLamp(g, w, index) {
  if (!ownLamp(g, index) || !hasLamp(g, w)) return false;
  const r = rec(g, w);
  if (r.lamp === index) return false;
  r.lamp = index;
  g.emit('lamp', { lamp: index, work: w, all: false });
  return true;
}
// WorksWorker.EquipSkinLamp (UI_Theme.SelectLamp after the msg_changeLampAll popup): save the lamp type and put the lamp on
// every facility that Work.haveLamp, including the ones in storage.
export function equipLampAll(g, index) {
  const t = S(g);
  if (!ownLamp(g, index) || t.lampType === index) return false;
  t.lampType = index;
  for (const w of allWorks(g)) if (hasLamp(g, w)) rec(g, w).lamp = index;
  g.emit('lamp', { lamp: index, all: true });
  return true;
}

// ---- forest themes (Theme.json) ----
// UI_Theme.ShowUI builds the list: a row with eventType 0 is always listed, an event row only once owned (inferred).
export function themeList(g) {
  return g.t.Theme.filter(r => r.eventType === 0 || ownTheme(g, r.index)).map(r => ({
    index: r.index, row: r, own: ownTheme(g, r.index), cost: r.cost, costType: r.costType, current: S(g).theme === r.index,
    buyable: !ownTheme(g, r.index) && r.cost > 0 && r.costType === COST_GEM,
  }));
}
export function buyTheme(g, index) {
  const r = themeRow(g, index);
  if (!r || ownTheme(g, index) || !(r.cost > 0) || r.costType !== COST_GEM || g.state.gem < r.cost) return false;
  g.state.gem -= r.cost;
  addTheme(g, index);
  g.emit('themeBuy', { theme: index });
  return true;
}
// Spawn.ChangeThemeType: the owned theme becomes the one in use.
export function setTheme(g, index) {
  const t = S(g);
  if (!ownTheme(g, index) || t.theme === index) return false;
  t.theme = index;
  g.emit('themeSet', { theme: index });
  return true;
}
export const currentTheme = g => S(g).theme;
// Texture stems and camera colour of a theme (data/theme.json "ground").
export const groundOf = (g, index) => g.data.theme.ground[String(index)] || g.data.theme.ground['0'];

// ---- special theme shop (ThemeShop.json, ThemeSpecial.json) ----
export function themeType(g, index = S(g).theme) { const r = themeRow(g, index); return r ? r.theme_type : 0; }
export function addMoney(g, rewardType, v) {
  const type = MONEY_TYPES[rewardType];
  if (!type || !(v > 0)) return null;
  const m = S(g).money;
  m[type] = (m[type] || 0) + v;
  return { type: rewardType, value: v };
}
export const moneyOf = (g, type) => S(g).money[type] || 0;
export function shopRows(g, type) {
  return (g.data.theme.shop || []).filter(r => r.theme_type === type).map(r => {
    const bought = S(g).shopBuy[r.index] || 0;
    // UI_ThemeShop.SoldOut: lamp / theme / work skin rewards are sold out once owned, the rest by enableCount.
    const owned = { 14: ownLamp, 22: ownTheme, 26: ownSkin, 27: ownSign }[r.rewardType];
    return { index: r.index, row: r, bought, soldOut: bought >= r.enableCount || (owned ? owned(g, r.rewardValue) : false), cost: r.requireValue, rewardType: r.rewardType, rewardValue: r.rewardValue,
      canGive: r.rewardType <= 4 || !!g.features.find(f => f.rewards && f.rewards[r.rewardType]) };
  });
}
export function shopBuy(g, index) {
  const r = (g.data.theme.shop || []).find(x => x.index === index);
  if (!r) return false;
  const row = shopRows(g, r.theme_type).find(x => x.index === index);
  if (row.soldOut || !row.canGive || moneyOf(g, r.theme_type) < r.requireValue) return false;
  const got = g.reward(r.rewardType, r.rewardValue);
  if (!got) return false;
  S(g).money[r.theme_type] -= r.requireValue;
  S(g).shopBuy[index] = (S(g).shopBuy[index] || 0) + 1;
  g.emit('themeShop', { row: index });
  return true;
}

// ---- registry entry ----
const feature = {
  id: 'theme',
  data: ['theme'],

  init(g) {
    const s = g.state;
    const t = s.theme ||= {};
    t.themes ||= [0];
    t.theme ??= 0;
    t.skins ||= [];
    t.signs ||= [];
    t.lamps ||= [0];
    t.lampType ??= 0;
    t.work ||= {};
    t.money ||= {};
    t.shopBuy ||= {};
    // DataManager.ValidOwnSkin: every row whose HowAquire is Always is owned.
    for (const r of g.t.WorkSkin) if (r.howAquire === HOW.ALWAYS) addOnce(t.skins, r.index);
    for (const r of g.t.SignSkin) if (r.howAquire === HOW.ALWAYS) addOnce(t.signs, r.index);
  },

  // A level-up can open a sign skin whose HowAquire is Lv (howAquire_Value = the level) (inferred from the enum name).
  onEvent(g, e) {
    if (e.type !== 'upgrade' || !e.work) return;
    for (const r of g.t.SignSkin) {
      if (r.howAquire === HOW.LV && e.work.lv >= r.howAquire_Value && g.work.get(e.work.a).existSignSkins.includes(r.index)) addSign(g, r.index);
    }
  },

  rewards: {
    14: (g, v) => (addLamp(g, Number(v)) ? { type: 14, value: Number(v) } : null),
    22: (g, v) => (addTheme(g, Number(v)) ? { type: 22, value: Number(v) } : null),
    26: (g, v) => (addSkin(g, Number(v)) ? { type: 26, value: Number(v) } : null),
    27: (g, v) => (addSign(g, Number(v)) ? { type: 27, value: Number(v) } : null),
    8001: (g, v) => addMoney(g, 8001, Number(v)),
    8002: (g, v) => addMoney(g, 8002, Number(v)),
  },
};

export default {
  ...feature,
  skinRow, signRow, lampRow, themeRow, specialRow, addSkin, addSign, addLamp, addTheme, ownSkin, ownSign, ownLamp, ownTheme,
  rec, skinOf, signOf, lampOf, hasLamp, baseTile, skinList, equipSkin, buySkin, signList, equipSign, lampList, lampCatalog, equipLamp, equipLampAll,
  themeList, buyTheme, setTheme, currentTheme, groundOf, themeType, addMoney, moneyOf, shopRows, shopBuy,
};
