// Feature "collection" (sim part): the Collection sets (bt_collection), the picture book (bt_pictureBook) and the item storage
// "Kho" (Storage_item). Contract: js/sim/registry.js. Rules and citations: D:/catsoup-ref/rules/collection.md.
// Tables: data/collection.json (tools/export_collection.py) from Collection.json, PictureBook.json, Storage_item.json.
//
// State game.state.collection = {
//   have:  { <setIndex>: [0|1 per id of the set] }   ids ever owned (GameData.collections, DataManager.c:15853 CheckCollection)
//   fresh: { <setIndex>: [0|1 ...] }                 newly collected and not yet seen (DataManager.newCollection)
//   book:  { claimed: [<PictureBook index>] }        claimed picture-book rows (DataManager.AddPictureBookData)
//   items: { <rewardType>: n }                       item counts of the types no other feature keeps (see HELD)
// }
import * as B from '../big.js';
import { gradeValue, HEART_MATERIAL } from '../economy.js';

const CAT = 0, FISH = 1, FURNITURE = 2, OUTFIT = 3;           // Collection.type
const ABILITY_WORK = 1, ABILITY_RECIPE = 3;                    // Ability.type that reach the economy through the mult hook
const REST_FIRST = 100;                                        // Ability.index >= 100 of type 1: "recipe point gain up"
const POLL = 1;                                                // seconds of game time between ownership scans

// Item types that land in storage because no other feature lists them in `rewards`. DataManager.GetItemCount (:44424) keeps
// them in GameData's generic item dictionary; here that dictionary is state.collection.items.
//   88 paid gems, 24 macaron (catFood101), 96 souvenir token, 6001 telescope lens, 1401-1408 / 1501-1524 observatory
//   tickets, 3002-3013 travel items (Storage_item.json). 98, 99 and 6002 are held by missions and fishing; 23 and the
//   gold / energy tickets by specials; 7102-7109 are fish cookies that go to the fishing inventory.
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const HELD = [88, 24, 96, 6001, ...range(1401, 1408), ...range(1501, 1524), ...range(3002, 3013)];
export const COOKIES = range(7102, 7109);

const S = g => g.state.collection;
const D = g => g.data.collection;

// ---- ownership (what DataManager.CheckCollectionAll scans, :77652) ----
// Cats: UnitData._type == id. Outfits: EquipData._assetIndex == id (an item is owned from level 1, equip.md). Fish: every
// catch calls CheckCollection(1, index, 0) (FishAquariumData.c:1082), so the fish book is the memory. Furniture belongs to the
// furniture feature, whose state is read without editing it (inferred: its owned()/state shapes are tried in turn).
const listHas = (list, id) => Array.isArray(list) && list.some(x => (x && typeof x === 'object' ? [x.i, x.a, x.id, x.index, x.asset].includes(id) : x === id));
export function owns(g, type, id) {
  if (type === CAT) return g.state.cats.some(c => c.type === id);
  if (type === OUTFIT) return !!(g.feat.equip && g.feat.equip.owned && g.feat.equip.owned(g, id));
  if (type === FISH) {
    const f = g.state.fishing;
    return !!f && !!((f.book && f.book[id]) || (f.inv && f.inv[id] && f.inv[id].n > 0));
  }
  if (type === FURNITURE) return ownsOther(g, 'furniture', id);
  return false;
}
// Picture-book kinds: 0 cat, 1 outfit, 2 furniture, 3 cat-tower prop, 4 facility skin, 5 timer skin (PictureBookType, UI_PictureBook.c:393).
const BOOK_OWNER = [(g, id) => owns(g, CAT, id), (g, id) => owns(g, OUTFIT, id), (g, id) => ownsOther(g, 'furniture', id),
  (g, id) => ownsOther(g, 'tower', id), (g, id) => ownsOther(g, 'theme', id, 'skins'), (g, id) => ownsOther(g, 'theme', id, 'timers')];
export const ownsBook = (g, type, id) => !!BOOK_OWNER[type] && BOOK_OWNER[type](g, id);

function ownsOther(g, feat, id, sub) {
  const f = g.feat[feat], s = g.state[feat];
  if (f) {
    for (const fn of ['owned', 'owns', 'has']) {
      if (typeof f[fn] === 'function') { try { if (f[fn](g, id, sub)) return true; } catch (e) { /* the feature's own shapes */ } }
    }
  }
  if (!s) return false;
  const pools = sub ? [s[sub]] : [s.owned, s.items, s.have, s.list, s.props, s.stock, s];
  return pools.some(p => (p && !Array.isArray(p) && typeof p === 'object' ? (p[id] > 0 || p[id] === true) : listHas(p, id)));
}

// ---- collection sets ----
export const sets = g => D(g).sets;
export const setOf = (g, index) => D(g).sets.find(c => c.index === index);
export const have = (g, index) => S(g).have[index] || [];
export function isComplete(g, index) {
  const h = S(g).have[index];
  return !!h && h.length > 0 && h.every(Boolean);                    // DataManager.IsCollectionComplete (:25713)
}
export const completeCount = g => D(g).sets.filter(c => isComplete(g, c.index)).length;
export const isFresh = (g, index) => !!(S(g).fresh[index] || []).some(Boolean);
export const freshIn = (g, type) => D(g).sets.some(c => c.type === type && isFresh(g, c.index));
export const anyFresh = g => D(g).sets.some(c => isFresh(g, c.index));

// CheckCollection / CheckCollectionAll: mark every owned id of every set; returns the sets that just became complete.
export function scan(g, type) {
  const s = S(g);
  const done = [];
  for (const c of D(g).sets) {
    if (type != null && c.type !== type) continue;
    const h = (s.have[c.index] ||= c.ids.map(() => 0));
    const was = h.every(Boolean);
    c.ids.forEach((id, k) => {
      if (h[k] || !owns(g, c.type, id)) return;
      h[k] = 1;
      (s.fresh[c.index] ||= c.ids.map(() => 0))[k] = 1;               // AddNewCollection (:70239)
    });
    if (!was && h.every(Boolean)) done.push(c.index);
  }
  for (const index of done) g.emit('collectionComplete', { index, ability: setOf(g, index).ability });
  if (done.length) g.emit('collection', { done });
  return done;
}
// ClearNewCollection (UI_Collection.OnCloseUI, UI_Collection.c:591)
export function clearFresh(g) { S(g).fresh = {}; }

// ---- ability of the complete sets (DataManager.UpdateAbilityAll, :120351; GetAbilityValue :56661) ----
// Value of one set = Ability.initValue * LFactor[lv-1]; the economy adds it as (1 + sum/100).
const abilityRow = (g, i) => (g._colAbility ||= new Map(g.t.Ability.map(a => [a.index, a]))).get(i);
export function abilityValue(g, ab, lv) { return ab.initValue * g.t.LFactor[Math.max(1, Math.min(lv, g.t.LFactor.length)) - 1].value; }
export function abilities(g) {
  const out = {};
  for (const c of D(g).sets) {
    if (!isComplete(g, c.index)) continue;
    const ab = abilityRow(g, c.ability);
    if (ab) out[c.ability] = (out[c.ability] || 0) + abilityValue(g, ab, c.abilityLv);
  }
  return out;
}
// Percent of one ability index from the collections (also for the type-11 sub abilities 500-505 that cats / specials read:
// photo, jar fairy, balloon, special order, offline time, frog prince gift; their subIndex is 1001-1006).
export const percent = (g, abilityIndex) => abilities(g)[abilityIndex] || 0;
export function subPercent(g, subIndex) {
  let sum = 0;
  for (const [k, v] of Object.entries(abilities(g))) { const a = abilityRow(g, +k); if (a && a.type === 11 && a.subIndex === subIndex) sum += v; }
  return sum;
}
const bonuses = g => {
  const ab = abilities(g), list = [];
  for (const [k, v] of Object.entries(ab)) { const a = abilityRow(g, +k); if (a) list.push({ a, v }); }
  return list;
};

// Type-1 abilities 0-66 act inside GradeValue of the facility named by subIndex: grade = GradeRaw * (1 + v/100) + 400 + lv, so
// the dish price changes by the ratio of the line's materials with and without it (core Game.stars() with an abilityMul).
function workRatio(g, line, list) {
  const mul = {};
  for (const { a, v } of list) if (a.type === ABILITY_WORK && a.index < REST_FIRST) mul[a.subIndex] = (mul[a.subIndex] || 0) + v;
  if (!Object.keys(mul).length) return 1;
  let base = B.ZERO, boosted = B.ZERO;
  for (const w of g.state.works) {
    const a = g.work.get(w.a);
    if (!a.needUnit || w.line !== line || (a.type !== 1 && a.type !== 2)) continue;
    const cat = g.catOf(w);
    if (!cat) continue;
    const f = (1 + HEART_MATERIAL[cat.heart] / 100) * (g.feat.cats && g.feat.cats.skillFactor ? g.feat.cats.skillFactor(g, cat, w) : 1);
    base = B.add(base, B.mul(gradeValue(a, w.lv), f));
    boosted = B.add(boosted, B.mul(gradeValue(a, w.lv, 1 + (mul[w.a] || 0) / 100), f));
  }
  return B.isZero(base) ? 1 : 10 ** (B.log10(boosted) - B.log10(base));   // log10: the sums can pass the double range
}

// ---- picture book (PictureBook.json, DataManager.CheckPictureBook :81247, UI_PictureBook.RewardAsset :1004) ----
export const bookRows = (g, type) => D(g).book.filter(r => type == null || r.type === type);
export const bookOwned = (g, row) => row.ids.map(id => ownsBook(g, row.type, id));
export const bookClaimed = (g, row) => S(g).book.claimed.includes(row.index);
export const bookReady = (g, row) => !bookClaimed(g, row) && bookOwned(g, row).every(Boolean);   // IsNewAllPictureBook (:27774)
export const bookDot = (g, type) => bookRows(g, type).some(r => bookReady(g, r));                  // HaveNewPictureBook (:23122)
export function claimBook(g, index) {
  const row = D(g).book.find(r => r.index === index);
  if (!row || !bookReady(g, row)) return null;
  S(g).book.claimed.push(row.index);                                                                  // AddPictureBookData
  const given = g.reward(row.rewardType, row.rewardValue, { from: 'pictureBook' });
  g.emit('bookClaim', { index: row.index, given });
  return { row, given };
}

// ---- storage "Kho" (UI_Storage.MakeData_Item :1158; DataManager.GetItemCount :44424) ----
export function itemCount(g, type) {
  const s = g.state;
  if (type === 3) return s.gem;                                      // freeGem; paid gems (88) do not exist in this port
  if (type === 4) return s.coin;
  if (type === 23) return (s.specials && s.specials.pudding) || 0;
  if (type === 6002) return (s.fishing && s.fishing.bait) || 0;
  if (type === 98 || type === 99) return (S(g).items[type] || 0) + ((s.missions && s.missions.bag && s.missions.bag[type]) || 0);
  if (s.specials && s.specials.tickets && s.specials.tickets[type] != null && (type >= 1101 && type <= 1203)) return s.specials.tickets[type];
  if (type >= 7102 && type <= 7109) { const v = s.fishing && s.fishing.inv[type - 7000]; return v ? v.n : (S(g).items[type] || 0); }
  return S(g).items[type] || 0;
}
// MakeData_Item: rows with a count, plus the DisplayAtZero rows at 0. Display order = table order.
export function storageRows(g) {
  const out = [];
  for (const r of D(g).storage) {
    const n = itemCount(g, r.type);
    if (n < 1 && !r.zero) continue;
    out.push({ row: r, type: r.type, count: Math.max(0, n) });
  }
  return out;
}
const hold = type => (g, value) => { const it = S(g).items; it[type] = (it[type] || 0) + Number(value); return { type, value: Number(value), stored: true }; };
const cookie = type => (g, value) => {
  const f = g.feat.fishing;
  if (f && f.addFish) { for (let i = 0; i < Number(value); i++) f.addFish(g, type - 7000, true); return { type, value: Number(value), stored: true }; }
  return hold(type)(g, value);
};
const rewards = { ...Object.fromEntries(HELD.map(t => [t, hold(t)])), ...Object.fromEntries(COOKIES.map(t => [t, cookie(t)])) };

export default {
  id: 'collection',
  data: ['collection'],

  init(g) {
    const s = g.state;
    if (!s.collection) s.collection = { have: {}, fresh: {}, book: { claimed: [] }, items: {}, at: 0 };
    const c = s.collection;
    c.have ||= {}; c.fresh ||= {}; c.items ||= {}; c.book ||= { claimed: [] }; c.book.claimed ||= []; c.at ||= 0;
    scan(g);
  },

  tick(g, dt) {
    const c = S(g);
    if (!c) return;
    c.at += dt;
    if (c.at < POLL) return;
    c.at = 0;
    scan(g);
  },

  offline(g) { scan(g); },

  onEvent(g, e) {
    if (!S(g)) return;                                   // core emits while building the first state, before init
    if (e.type === 'fish' && e.fish != null) scan(g, FISH);
    else if (e.type === 'cat' || e.type === 'catSwap') scan(g, CAT);
  },

  rewards,

  // Core multiplier hook (economy.md 68-69, 84-85), the same two kinds the equipment uses:
  //   'price'  arg = Food row: Ability type 3 with subIndex == food.index (equipment sets) times the line's work ratio (cat sets)
  //   'energy' arg = rest work record: Ability type 1, index >= 100, subIndex == work.a (furniture sets)
  mult(g, kind, arg) {
    const list = bonuses(g);
    if (!list.length) return 1;
    let sum = 0;
    for (const { a, v } of list) {
      if (kind === 'price' && a.type === ABILITY_RECIPE && a.subIndex === arg.index) sum += v;
      else if (kind === 'energy' && a.type === ABILITY_WORK && a.index >= REST_FIRST && a.subIndex === arg.a) sum += v;
    }
    let m = 1 + sum / 100;
    if (kind === 'price') m *= workRatio(g, arg.type, list);
    return m;
  },

  // actions
  scan, owns, ownsBook, isComplete, completeCount, isFresh, freshIn, anyFresh, clearFresh, abilities, percent, subPercent, abilityValue,
  setOf, have, sets, bookRows, bookOwned, bookClaimed, bookReady, bookDot, claimBook, itemCount, storageRows,
};
