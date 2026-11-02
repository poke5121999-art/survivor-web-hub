// Feature "fishing" (sim part): fishing ground (work 10), fish inventory, aquarium (work 33) and the fish book.
// Contract: js/sim/registry.js. Rules and citations: D:/catsoup-ref/rules/fishing.md. Pure JS, no DOM, no THREE.
//
// State game.state.fishing:
//   inv   { fishId: { n: owned, a: of those placed in the aquarium } }       (FishInvenData list, aggregated)
//   book  { fishId: times caught }                                           (AquaFishData list, ids < 100 and >= 400)
//   bait  star-candy baits left                                               (DataManager.GetSpecialFishingCount)
//   fresh { fishId: true }                                                    (FishInvenData.isNew)
//   theme, themes[]                                                           (AquariumData.themeID / themeList)
//   cats[]                                                                    (AquariumData.deployCatList)
//   lost  fish that did not fit the 999 cap (the original mails them)
import * as B from '../big.js';

export const WORK_FISHING = 10;
export const WORK_AQUARIUM = 33;
export const INV_MAX = 999;          // FishAquariumData.AddNewFish_Inner: GetInvenFishCount < 999 (FishAquariumData.c:~1000)
export const AQUA_MAX = 500;         // UI_FishPopup.get_CanDeployFishToAquarium: curAmount + total < 0x1f5 (UI_FishPopup.c:1)
export const AQUA_CATS = 1;          // FishAquariumData ctor: _MaxAquariumDeployCatCount = 1 (FishAquariumData.c:388)
export const PRICE_FACTOR = 600;     // DataManager.GetFishPrice: avgGold x heartValue x 600.0 (DataManager.c:1312, 0x44160000)
export const ENERGY_PER_STAR = 0.01; // CalculateFishBookEnergyBonus (FishAquariumData.c:3057), normal book (id < 100)
export const FOOD_PER_STAR = 0.02;   // CalculateFishBookSellFoodBonus (FishAquariumData.c:3230), special book (id >= 400)
export const ROLL = 1000;            // AddNewFish_Inner: RandomValue(1000), fish qualifies when 1000 - probability <= roll

const poolOf = id => (id >= 400 ? 'special' : id >= 100 ? 'feed' : 'normal');
export const isBookFish = id => id < 100 || id >= 400;   // RegistFishBook skips 100..399

export default {
  id: 'fishing',
  // Star-candy bait (6002) is a plain counter of this slice; exposed as a count map for game.itemCount / spendItem.
  bag: g => ({ get 6002() { return g.state.fishing.bait; }, set 6002(v) { g.state.fishing.bait = v; } }),
  data: ['fishing'],

  init(game) {
    const s = game.state;
    if (!s.fishing) s.fishing = { inv: {}, book: {}, bait: 0, fresh: {}, theme: 0, themes: [0], cats: [], lost: 0, casts: 0, ads: 0 };
    game.fishTable = new Map(game.data.fishing.fish.map(r => [r.index, r]));
  },

  // star-candy bait (rewardType 6002, specials.md section 1) and fish (rewardType 7, rewardValue = Fish index).
  rewards: {
    7: (game, value) => {
      const r = addFish(game, Number(value), true);
      return { type: 7, value: Number(value), mailed: !r };
    },
    6002: (game, value) => { game.state.fishing.bait += Number(value); return { type: 6002, value: Number(value) }; },
  },

  // The book bonuses enter GetFoodPrice / GetEnergyAmount through the core's mult hook.
  mult(game, kind) {
    if (kind === 'price') return 1 + bookBonus(game).food;
    if (kind === 'energy') return 1 + bookBonus(game).energy;
    return 1;
  },

  // ---- actions (view calls game.feat.fishing.fn(game, ...)) ----
  fishWork, charges, canCast, cast, adBait, pool, candidates, pick, addFish, count, owned, sellable, sellPrice,
  sell, store, unstore, unstoreAll, aquaCount, feed, bookBonus, bookMax, bookCount, buyTheme, setTheme, deployCat,
  undeployCat, clearNew, hasNew, fishOf, buildPool,
};

export function fishOf(game, id) { return game.fishTable.get(id); }
export function fishWork(game) { return game.state.works.find(w => w.a === WORK_FISHING) || null; }
export function charges(game) { const w = fishWork(game); return w ? w.v : 0; }

// Own an equipment whose index is `value`? The equip feature answers when it has an `owned` action; without it the
// fish that gives equipment stays out of the pool (the reward could not be paid).
function ownsEquip(game, value) {
  const eq = game.feat.equip;
  if (eq && typeof eq.owned === 'function') return !!eq.owned(game, value);
  return true;
}

// FishAquariumData.GetFishAssetData predicates (<GetFishAssetData>b__61_1 normal, b__61_0 special):
//   normal : type 0, or type 99 whose reward is not equipment, or equipment not owned yet
//   special: type 4, or type 99 equipment not owned yet (300..302 are excluded: index < 300 or > 302 only)
export function buildPool(game, special) {
  const rows = game.data.fishing.fish;
  return rows.filter(f => {
    if (f.type === (special ? 4 : 0)) return true;
    if (f.type !== 99) return false;
    if (f.rewardType === 5) return !ownsEquip(game, f.rewardValue);
    return !special;                       // 300..302 (furniture coins) are normal-pool only: special excludes index 300..302
  });
}
export function pool(game, special) { return buildPool(game, special); }

// AddNewFish_Inner: roll = RandomValue(1000); every pool fish with 1000 - probability <= roll is a candidate.
export function candidates(poolRows, roll) { return poolRows.filter(f => ROLL - f.probability <= roll); }
// Pick: uniform among candidates (RandomValue(count)); `roll` and `u` (0..1) are injectable for tests.
export function pick(game, special, roll = Math.floor(game.rng() * ROLL), u = game.rng()) {
  const c = candidates(buildPool(game, special), roll);
  return c[Math.min(c.length - 1, Math.floor(u * c.length))];
}

export function count(game, kind) {
  let n = 0;
  for (const [id, v] of Object.entries(game.state.fishing.inv)) if (poolOf(+id) === kind) n += v.n;
  return n;
}
export function owned(game, id) { const v = game.state.fishing.inv[id]; return v ? v.n : 0; }
export function aquaCount(game) { let n = 0; for (const v of Object.values(game.state.fishing.inv)) n += v.a; return n; }
export function sellable(game, id) { const v = game.state.fishing.inv[id]; return v ? v.n - v.a : 0; }

// FishAquariumData.AddFish + RegistFishBook. Returns false when the pool is full (the original mails the fish).
export function addFish(game, id, fromReward = false) {
  const f = game.state.fishing;
  const row = game.fishTable.get(id);
  if (!row) return false;
  if (count(game, poolOf(id)) >= INV_MAX) { f.lost += 1; game.emit('fishFull', { fish: id }); return false; }
  const v = f.inv[id] || (f.inv[id] = { n: 0, a: 0 });
  v.n += 1;
  f.fresh[id] = true;
  const first = isBookFish(id) && !f.book[id];
  if (isBookFish(id)) f.book[id] = (f.book[id] || 0) + 1;
  game.emit('fish', { fish: id, first, special: row.type === 4, reward: fromReward });
  return true;
}

export function canCast(game, special = false) {
  return charges(game) >= 1 && (!special || game.state.fishing.bait >= 1);
}

// One successful raise of the quill (UI_Fishing.OnClickRaise, UI_Fishing.c:3004): costs one charge of work 10 (and one
// star-candy bait for special fishing); the fish comes from AddNewFish. Type 99 rows pay their reward instead of a fish.
export function cast(game, special = false) {
  if (!canCast(game, special)) return null;
  const f = game.state.fishing;
  const w = fishWork(game);
  const row = pick(game, special);
  w.v -= 1;
  if (special) f.bait -= 1;
  f.casts += 1;
  let result;
  if (row.type === 99) {
    const given = game.reward(row.rewardType, row.rewardValue, { fish: row.index, equip: row.rewardValue });
    result = { fish: row.index, row, reward: given };
  } else {
    result = { fish: row.index, row, stored: addFish(game, row.index) };
  }
  game.emit('fishCast', { fish: row.index, special });
  return result;
}

// Ad button (UI_Fishing.RewardAds: AddExtraFishingCount + IncreaseWorkValue +1): pays at once.
export function adBait(game) {
  const w = fishWork(game);
  if (!w) return false;
  w.v += 1;
  game.state.fishing.ads += 1;
  return true;
}

// DataManager.GetFishPrice(asset, amount): average gold per second x heartValue x 600 x amount.
export function sellPrice(game, id, n = 1) {
  const row = game.fishTable.get(id);
  return B.mul(game.averageIncome(), row.heartValue * PRICE_FACTOR * n);
}

// Sell fish that are not in the aquarium (FishAquariumData.SellFishBatch).
export function sell(game, id, n = 1) {
  const f = game.state.fishing;
  const v = f.inv[id];
  if (!v || n < 1 || n > v.n - v.a) return null;
  const gold = sellPrice(game, id, n);
  v.n -= n;
  if (!v.n) delete f.inv[id];
  game.state.gold = B.add(game.state.gold, gold);
  game.emit('fishSell', { fish: id, n, gold });
  return gold;
}

// StoreToAqua: n fish of this kind into the aquarium while the total stays under 500.
export function store(game, id, n = 1) {
  const f = game.state.fishing;
  const v = f.inv[id];
  if (!v || n < 1 || n > v.n - v.a || aquaCount(game) + n > AQUA_MAX) return false;
  v.a += n;
  delete f.fresh[id];
  return true;
}
export function unstore(game, id, n = 1) {
  const v = game.state.fishing.inv[id];
  if (!v || n < 1 || n > v.a) return false;
  v.a -= n;
  return true;
}
export function unstoreAll(game) { for (const v of Object.values(game.state.fishing.inv)) v.a = 0; }

// Fish as cat food (specials.md 2.4, mission 2 / quest 4): the fish is eaten and its heartValue goes to the cat's hearts.
// The cats feature owns hearts; it listens to 'fishHeart' {cat, catId, value, fish}.
export function feed(game, catId, id) {
  const cat = game.state.cats.find(c => c.id === catId);
  const v = game.state.fishing.inv[id];
  if (!cat || !v || v.n - v.a < 1) return null;
  v.n -= 1;
  if (!v.n) delete game.state.fishing.inv[id];
  const value = game.fishTable.get(id).heartValue;
  game.emit('fishHeart', { cat, catId, value, fish: id });
  return value;
}

// Fish book bonus: sum over caught fish of min(times caught, group) x grade (stars) x 0.01 (normal) / 0.02 (special).
export function bookBonus(game) {
  const f = game.state.fishing;
  let e = 0, s = 0;
  for (const [id, n] of Object.entries(f.book)) {
    const row = game.fishTable.get(+id);
    if (!row) continue;
    const stars = Math.min(n, row.group) * row.grade;
    if (+id < 100) e += stars * ENERGY_PER_STAR; else s += stars * FOOD_PER_STAR;
  }
  return { energy: e, food: s };
}
// Stars of the whole book and the ones caught so far, for the gauge of UI_AquaInven.
export function bookMax(game, special) {
  let s = 0;
  for (const r of game.data.fishing.fish) if (isBookFish(r.index) && (r.index >= 400) === !!special) s += r.group * r.grade;
  return s;
}
export function bookCount(game, special) {
  let s = 0;
  for (const [id, n] of Object.entries(game.state.fishing.book)) {
    const r = game.fishTable.get(+id);
    if (r && (r.index >= 400) === !!special) s += Math.min(n, r.group) * r.grade;
  }
  return s;
}

// ThemeAqua: costType 3 = gems (reward type 3). Theme 0 is free.
export function buyTheme(game, index) {
  const f = game.state.fishing;
  const t = game.data.fishing.themes.find(x => x.index === index);
  if (!t || f.themes.includes(index) || game.state.gem < t.cost) return false;
  game.state.gem -= t.cost;
  f.themes.push(index);
  return true;
}
export function setTheme(game, index) {
  const f = game.state.fishing;
  if (!f.themes.includes(index)) return false;
  f.theme = index;
  return true;
}

export function deployCat(game, catId) {
  const f = game.state.fishing;
  if (f.cats.includes(catId) || f.cats.length >= AQUA_CATS || !game.state.cats.some(c => c.id === catId)) return false;
  f.cats.push(catId);
  return true;
}
export function undeployCat(game, catId) {
  const f = game.state.fishing;
  const i = f.cats.indexOf(catId);
  if (i < 0) return false;
  f.cats.splice(i, 1);
  return true;
}

export function hasNew(game) { return Object.keys(game.state.fishing.fresh).length > 0; }
export function clearNew(game, id) { delete game.state.fishing.fresh[id]; }
