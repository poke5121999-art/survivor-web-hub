// Feature "furniture" (sim part): the furniture shop (facility 111), its daily goods and catalog, selling, the furniture stock,
// the mini room of every cat and reward type 6. Rules and citations: D:/catsoup-ref/rules/furniture.md. Contract: js/sim/registry.js.
//
// State game.state.furniture:
//   inv    { <Furniture index>: count }                   GameData.ltFurniture (FurnitureData _assetIndex, _count)
//   goods  [i0, i1, i2]                                   GameData.ltGoodsFurniture; a negative entry is a sold slot (BuyDailyFurniture negates it)
//   day    'YYYY-MM-DD' of the last daily restock         DataManager.RefreshDailyFurniture runs on the first tick of a new day
//   ads    restocks by ad left today                      Work 111 dailyCount
//   rooms  { <cat id>: { floor, wall, items: [{n, a, x, y, dir}] } }   UnitData _room_floor, _room_wall, _furniture (RoomData)
//   nextN  counter for item ids inside rooms

export const GOODS = 3;                  // RefreshDailyFurniture picks 3 goods (DataManager.c:96448 `iVar28 = 3`)
export const RATE_NORMAL = 0.9;          // BALANCE.Daily_Furniture_Normal_CostRate, Init 43 (specials.md)
export const RATE_LIMIT_HAVE = 0.9;      // Init 44
export const RATE_LIMIT_NOHAVE = 5;      // Init 45
export const LIMIT_PICK = 20;            // goods come from the limited pool when RandomValue(100) >= 80 (DataManager.c:96620)
export const RESTOCK_GEMS = 30;          // Shop.json row 38 "가구점 새로고침": costType 3 (gem), cost 30
export const SHOP = 111;                 // Work.json 111 "가구점", type 8, needWork 14, dailyCount 3
export const SHOP_NEEDS = 14;
export const ROOM_MAX = 50;              // UI_UnitInfo.ChangeFurniture: msg_limintFurniture when the room already holds more than 0x32
export const SELL_RATE = 0.5;            // (inferred) the sell screen has no price in the decompile
export const ROOM_X = 0.35;              // UI_UnitInfo.CaculateFurniturePos clamps x to +-0.35
// y range by Furniture.type (CaculateFurniturePos switch selectFurnitureType); types 1 (floor) and 2 (wall) are not moved
export const ROOM_Y = { 3: [-0.38, -0.13], 4: [-0.13, 0.4], 5: [-0.5, 0.4], 6: [-0.5, 0.4], 7: [-0.5, 0.4] };
// GameExtensions.EnableTabIndex: catalog tab -> Furniture.type values
export const TABS = [[1], [2], [3, 5], [4], [6, 7]];

const S = g => g.state.furniture;
const rows = g => (g._furnRows ||= new Map(g.t.Furniture.map(r => [r.index, r])));
export const row = (g, i) => rows(g).get(i);
const round = x => Math.round(x);

// ---- cost ----
// GameExtensions.Daily_FurnitureCost (GameExtensions.c:3686): int(round(cost x rate x 1000) / 1000); eventType < 1 uses the
// normal rate, an event piece 0.9 when owned and x5 when not.
export function dailyCost(g, r, have) {
  const rate = r.eventType < 1 ? RATE_NORMAL : have ? RATE_LIMIT_HAVE : RATE_LIMIT_NOHAVE;
  return Math.trunc(round(r.cost * rate * 1000) / 1000);
}

// ---- stock ----
export const count = (g, i) => S(g).inv[i] || 0;
export const placedCount = (g, i) => Object.values(S(g).rooms).reduce((n, r) => n + r.items.filter(x => x.a === i).length + (r.floor === i) + (r.wall === i), 0);
// DataManager.Have_FurnitureCheck (DataManager.c:23396): in stock, or placed in a cat's room.
export const owns = (g, i) => count(g, i) > 0 || placedCount(g, i) > 0;

// DataManager.AddFurniture (:6023): count + n (a new FurnitureData when missing).
export function add(g, i, n = 1) {
  if (!row(g, i) || !(n > 0)) return false;
  const s = S(g);
  const first = !owns(g, i);
  s.inv[i] = (s.inv[i] || 0) + n;
  g.emit('furnitureAdd', { index: i, count: n, first });
  return true;
}

// DataManager.RemoveFurniture (:30981): needs count > 0; the entry disappears at 0.
export function remove(g, i) {
  const s = S(g);
  if (!(count(g, i) > 0)) return false;
  if (--s.inv[i] <= 0) delete s.inv[i];
  return true;
}

// ---- daily goods ----
// DataManager.RefreshDailyFurniture (:95995): pools by Furniture.eventType (b__705_1 keeps eventType >= 0): 0 -> normal; > 0 and owned
// -> limited; (1 and not owned -> never listed in this table). Three picks: limited with 20 % when it is not empty, else normal.
export function pools(g) {
  const normal = [], limited = [];
  for (const r of g.t.Furniture) {
    if (r.eventType === 0) normal.push(r.index);
    else if (r.eventType > 0 && owns(g, r.index)) limited.push(r.index);
  }
  return { normal, limited };
}

export function refreshDaily(g) {
  const s = S(g);
  const { normal, limited } = pools(g);
  const goods = [];
  for (let k = 0; k < GOODS; k++) {
    const useLimit = limited.length > 0 && Math.floor(g.rng() * 100) >= 100 - LIMIT_PICK;
    const pool = useLimit ? limited : normal;
    if (!pool.length) break;
    const j = Math.floor(g.rng() * pool.length);
    goods.push(pool[j]);
    pool.splice(j, 1);
  }
  s.goods = goods;
  g.emit('furnitureRestock', { goods: goods.slice() });
  return goods;
}

export const today = (ms = Date.now()) => {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Spawn.RefreshDayWorkCount -> ResetDailyFurniture on a date change (specials.md, Spawn+_TimeFlow_d__177.c:1230-1313).
export function ensureDaily(g, day = today()) {
  const s = S(g);
  if (s.day === day && s.goods.length) return false;
  s.day = day;
  s.ads = dailyAds(g);
  refreshDaily(g);
  return true;
}

export const dailyAds = g => g.work.get(SHOP).dailyCount;
export const slot = (g, k) => {
  const i = S(g).goods[k];
  if (i === undefined) return null;
  const r = row(g, Math.abs(i));
  const have = owns(g, r.index);
  return { k, index: r.index, row: r, sold: i < 0, have, price: dailyCost(g, r, have) };
};

// Purchase of Shop rows 24..26 with costValue = -Daily_FurnitureCost (DataManager.c:91489-91492), then AddFurniture and BuyDailyFurniture.
export function buyDaily(g, k) {
  const s = S(g), sl = slot(g, k);
  if (!sl) return { ok: false, why: 'noSlot' };
  if (sl.sold) return { ok: false, why: 'sold' };              // msg_alreadyPurchase (DataManager.c:91452)
  if (s.furnitureLocked) return { ok: false, why: 'locked' };
  if (g.state.coin < sl.price) return { ok: false, why: 'coin' };
  g.state.coin -= sl.price;
  add(g, sl.index, 1);
  s.goods[k] = -s.goods[k];                                    // DataManager.BuyDailyFurniture (:12481)
  g.emit('furnitureBuy', { index: sl.index, price: sl.price, daily: true });
  return { ok: true, index: sl.index, price: sl.price };
}

// UI_FurnitureShop.OnClickCoin: ConsumeMoney(gem, Shop 38 cost 30) then RefreshDailyFurniture. OnClickAds: ad -> restock while the work's
// daily counter is above 0 (UI_FurnitureShop.c:667). Both are the same restock.
export function restock(g, how) {
  const s = S(g);
  if (how === 'ads') {
    if (s.ads <= 0) return { ok: false, why: 'ads' };
    s.ads--;
  } else {
    if (g.state.gem < RESTOCK_GEMS) return { ok: false, why: 'gem' };
    g.state.gem -= RESTOCK_GEMS;
  }
  refreshDaily(g);
  return { ok: true, goods: s.goods.slice() };
}

// ---- catalog ----
// UI_FurnitureShopCatalog.FindDataList (b__0 eventType == 0, b__1 eventType >= 0 with the "not for sale" toggle) filtered by EnableTabIndex.
export function catalog(g, tab, showAll = false) {
  const types = TABS[tab] || [];
  return g.t.Furniture.filter(r => types.includes(r.type) && (showAll ? r.eventType >= 0 : r.eventType === 0));
}
export const canOrder = r => r.eventType < 1 && r.cost > 0;     // BuyNow: msg_notForSale for event pieces (UI_FurnitureShopCatalog.c:762)

// UI_FurnitureShopCatalog+<>c__DisplayClass30_0.<BuyNow>b__1 (:34): ConsumeMoney(coin, -cost) then GetReward(6, index).
export function buyCatalog(g, i) {
  const r = row(g, i);
  if (!r) return { ok: false, why: 'noRow' };
  if (!canOrder(r)) return { ok: false, why: 'notForSale' };
  if (g.state.coin < r.cost) return { ok: false, why: 'coin' };
  g.state.coin -= r.cost;
  g.reward(6, i);
  g.emit('furnitureBuy', { index: i, price: r.cost, daily: false });
  return { ok: true, index: i, price: r.cost };
}

// ---- selling ----
// info_sellFurniture: event pieces and pieces placed in a mini room cannot be sold, so only stock with eventType < 1 counts.
export const sellable = g => Object.keys(S(g).inv).map(Number).filter(i => row(g, i).eventType < 1 && row(g, i).cost > 0).sort((a, b) => a - b);
export const sellPrice = (g, r) => Math.floor(r.cost * SELL_RATE);
export function sell(g, i, n = 1) {
  const r = row(g, i);
  if (!r || r.eventType > 0 || !(r.cost > 0)) return { ok: false, why: 'notForSale' };
  if (count(g, i) < n) return { ok: false, why: 'none' };
  for (let k = 0; k < n; k++) remove(g, i);
  const coin = sellPrice(g, r) * n;
  g.state.coin += coin;
  g.emit('furnitureSell', { index: i, count: n, coin });
  return { ok: true, coin };
}

// ---- mini rooms ----
// UI_UnitInfo.ChangeFurnitureData (:14) passes defaultCheck 0 for the floor and 1 for the wall: Furniture 0 "floor0" and 1 "wall0" are the
// room's own and never stock; changing away from anything else returns that piece (DataManager.ReturnFurniture).
export const DEFAULT = { floor: 0, wall: 1 };
const defaultRoom = () => ({ floor: DEFAULT.floor, wall: DEFAULT.wall, items: [] });
export function room(g, catId) {
  const s = S(g);
  return (s.rooms[catId] ||= defaultRoom());
}

export const clampX = x => Math.max(-ROOM_X, Math.min(ROOM_X, x));
export function clampY(type, y) {
  const r = ROOM_Y[type];
  return r ? Math.max(r[0], Math.min(r[1], y)) : y;
}

// UI_UnitInfo.PutFurniture_FromIndex (:7953): floor (type 1) and wall (type 2) replace the current one, which goes back to stock
// (ChangeFurnitureData -> ReturnFurniture); every other piece is refused once the room holds more than 50.
export function place(g, catId, i, x = 0, y = 0, dir = 0) {
  const r = row(g, i);
  if (!r) return { ok: false, why: 'noRow' };
  if (!g.state.cats.some(c => c.id === catId)) return { ok: false, why: 'noCat' };
  const rm = room(g, catId);
  if (r.type === 1 || r.type === 2) {
    const key = r.type === 1 ? 'floor' : 'wall';
    if (rm[key] === i) return { ok: false, why: 'same' };
    if (i !== DEFAULT[key] && !remove(g, i)) return { ok: false, why: 'none' };
    if (rm[key] !== DEFAULT[key]) add(g, rm[key], 1);
    rm[key] = i;
    g.emit('furniturePlace', { cat: catId, index: i, kind: key });
    return { ok: true, kind: key };
  }
  if (rm.items.length > ROOM_MAX) return { ok: false, why: 'full' };
  if (!remove(g, i)) return { ok: false, why: 'none' };
  const s = S(g);
  const it = { n: s.nextN++, a: i, x: round(clampX(x) * 1000) / 1000, y: round(clampY(r.type, y) * 1000) / 1000, dir: dir ? 1 : 0 };
  rm.items.push(it);
  g.emit('furniturePlace', { cat: catId, index: i, kind: 'item', item: it });
  return { ok: true, kind: 'item', item: it };
}

export function moveItem(g, catId, n, x, y) {
  const it = room(g, catId).items.find(q => q.n === n);
  if (!it) return false;
  it.x = round(clampX(x) * 1000) / 1000;
  it.y = round(clampY(row(g, it.a).type, y) * 1000) / 1000;
  return true;
}

export function flipItem(g, catId, n) {
  const it = room(g, catId).items.find(q => q.n === n);
  if (!it) return false;
  it.dir ^= 1;
  return true;
}

// UI_UnitInfo.DeleteFurniture (:5143): the piece goes back to stock (DataManager.ReturnFurniture -> AddFurniture).
export function takeBack(g, catId, n) {
  const rm = room(g, catId);
  const k = rm.items.findIndex(q => q.n === n);
  if (k < 0) return false;
  const [it] = rm.items.splice(k, 1);
  add(g, it.a, 1);
  g.emit('furnitureTake', { cat: catId, index: it.a });
  return true;
}

// UI_UnitInfo.DeleteAllFurniture (:4807), msg_furnitureKeepAll: every piece of the room back to stock (floor and wall stay).
export function clearRoom(g, catId) {
  const rm = room(g, catId);
  const n = rm.items.length;
  for (const it of rm.items.splice(0)) add(g, it.a, 1);
  if (n) g.emit('furnitureTake', { cat: catId, count: n });
  return n;
}

// ---- the shop facility ----
export const shopWork = g => g.state.works.find(w => w.a === SHOP) || g.state.storage.find(w => w.a === SHOP) || null;
// Work 111 costs nothing (cost 0, costGem 0) but needs work 14 built (Work.json needWork).
export function canBuildShop(g) {
  return !shopWork(g) && g.copies(SHOP_NEEDS) > 0 && !!g.autoCell();
}
export function buildShop(g) {
  if (!canBuildShop(g)) return null;
  const w = g.place(SHOP, g.autoCell(), 0);
  g.state.stats.built += 1;
  ensureDaily(g);
  return w;
}

export default {
  id: 'furniture',
  data: [],
  init(g) {
    if (!g.state.furniture) g.state.furniture = { inv: {}, goods: [], day: '', ads: 0, rooms: {}, nextN: 1 };
    ensureDaily(g);
  },
  tick(g, dt) {
    const s = S(g);
    s.since = (s.since || 0) + dt;
    if (s.since < 5) return;             // a calendar check every 5 s
    s.since = 0;
    ensureDaily(g);
  },
  offline(g) { ensureDaily(g); },
  // DataManager.GetReward_Inner type 6 (:21107-21122): rewardValue is the Furniture index; AddFurniture.
  rewards: {
    6: (g, value, extra = {}) => {
      const n = extra.count > 0 ? extra.count : 1;
      return add(g, Number(value), n) ? { type: 6, value: Number(value), count: n } : null;
    },
  },
  dailyCost, count, owns, add, remove, pools, refreshDaily, ensureDaily, slot, buyDaily, restock, catalog, canOrder, buyCatalog,
  sellable, sellPrice, sell, room, place, moveItem, flipItem, takeBack, clearRoom, shopWork, canBuildShop, buildShop, row,
};
