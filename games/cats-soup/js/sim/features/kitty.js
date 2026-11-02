// Feature "kitty" (sim part): kittens, kitty houses, the dance stage, trips, the travel album and magnets. Contract: js/sim/registry.js.
// Rules and citations: D:/catsoup-ref/rules/kitty.md. Tables: data/kitty.json (tools/export_kitty.py).
//
// State game.state.kitty:
//   { nextId, houses: [work index of every built kitty house 402-404], stage: bool (dance stage 406 built),
//     kitties: [{ id, type (CatType index), house (402-404, 406), exp, trip: null | { items: [TravelItem index], left, total } }],
//     album: { <destination index>: photo }, pending: null | { dest, photo }, magnets: { <Magnet index>: count },
//     held: { <reward type>: n }  (only when the collection feature is missing),
//     stats: { trips, photos, magnets, tokens } }
// photo = { dest, pic (TravelPictureInfo index), pose, kitty (CatType), snack (TravelItem index | 0), petPos, at }
import * as B from '../big.js';
import { heartInfo } from './cats.js';

export const HOUSES = [402, 403, 404];       // Work type 13, completeTime 18000 s (Work.json); each needs the one before (needWork)
export const STAGE = 406;                    // Work type 15, dance stage; needs work 22, cost 1e25 gold (Work.json cost 1, digit 25)
export const STAGE_NEED = 22;
export const STAGE_COST = B.big(1, 25);
export const STAGE_MAX = 4;                  // CatUnlock has four rows for work 406
export const TRAVEL_BASE = 18000;            // seconds, Work 402 completeTime (DataManager.GotoKittyTravel)
export const ITEM_BASE = 3001;               // reward type of TravelItem n is 3001 + n (GotoKittyTravel: itemIndex = type - 0xbb9)
export const BUTTERFLY = 98;                 // Travel point = golden butterfly (collection.md, DataManager.GetItemCount)
export const TOKEN = 96;                     // souvenir token
export const MAGNET = 3500;                  // reward type 0xdac that ReturnKittyFromTravel pays for a magnet (value = Magnet index)
export const PHOTO_TYPES = { snack: 0, essential: 1, ticket: 2 };
export const REGIONS = 5;                    // TravelDestination.type 0 Asia, 1 Europe, 2 America, 3 Africa, 4 Oceania (5 = season event)
const ESSENTIAL_COMPASS = 5;                 // TravelItem 12 (imagination compass): itemValue 5 = Travel_DestType.SeasonEvent

const S = g => g.state.kitty;
const D = g => g.data.kitty;
const rnd = (g, n) => Math.floor(g.rng() * n);

// ---- tables ----
export const item = (g, index) => D(g).items.find(r => r.index === index) || null;
export const itemType = index => ITEM_BASE + index;
export const dest = (g, index) => D(g).dests.find(r => r.index === index) || null;
export const pic = (g, id) => (g._kPics ||= new Map(D(g).pics.map(r => [r[0], r]))).get(id) || null;
export const ability = (g, type) => D(g).abilities.find(r => r.type === type) || null;

// ---- inventory (the collection feature keeps travel items 3002-3013 and butterflies; this feature spends them) ----
export const count = (g, type) => g.itemCount(type);
const take = (g, type, n) => n >= 1 && g.spendItem(type, n);
export const itemCount = (g, index) => count(g, itemType(index));
// Give a travel item back through game.reward (collection keeps it).
const give = (g, index, n = 1) => g.reward(itemType(index), n, { from: 'kitty' });

// ---- kitties ----
export const kitties = g => S(g).kitties;
export const kitty = (g, id) => S(g).kitties.find(k => k.id === id) || null;
export const inHouse = (g, work) => S(g).kitties.find(k => k.house === work) || null;
export const stageKitties = g => S(g).kitties.filter(k => k.house === STAGE);
export const heart = (g, k) => heartInfo(g, k.exp);

// DataManager.GetRandomFirstKittyBodyType: the isFirst rows (48, 79, 80); GetRandomKittyBodyType: isKitty rows of the main game
// (eventType 0; season rows join while their season runs, which this port has not), the restricted type is skipped to the next.
export function randomType(g, first = false, restrict = -1) {
  const rows = D(g).types.filter(r => (first ? r.first === 1 : true) && r.event === 0);
  let i = rnd(g, rows.length);
  if (!first && restrict >= 0 && rows[i].index === restrict) i = (i + 1) % rows.length;
  return rows[i].index;
}

// DataManager.AddKittyData: a new kitty, heart 0.
export function addKitty(g, house, type) {
  const s = S(g);
  const k = { id: s.nextId++, type: type != null ? type : randomType(g, !s.kitties.length), house, exp: 0, trip: null };
  s.kitties.push(k);
  g.emit('kittyAdd', { kitty: k, house });
  return k;
}

// Building a kitty house is free (Work cost 0) once the one before it stands; the first kitty comes with it (Spawn.AddKitty).
export const canBuildHouse = (g, work) => {
  const i = HOUSES.indexOf(work);
  return i >= 0 && !S(g).houses.includes(work) && (i === 0 || S(g).houses.includes(HOUSES[i - 1]));
};
export function buildHouse(g, work) {
  if (!canBuildHouse(g, work)) return null;
  S(g).houses.push(work);
  g.emit('kittyHouse', { work });
  return addKitty(g, work);
}
export const nextHouse = g => HOUSES.find(w => !S(g).houses.includes(w)) || null;

// Dance stage (type 15): needs work 22 and 1e25 gold, brings the first kitty; more slots cost CatUnlock gems (0/400/500/600).
export const stageNeedsBuilt = g => g.copies(STAGE_NEED) > 0;
export const canBuildStage = g => !S(g).stage && stageNeedsBuilt(g) && B.gte(g.state.gold, STAGE_COST);
export function buildStage(g) {
  if (!canBuildStage(g)) return null;
  g.state.gold = B.sub(g.state.gold, STAGE_COST);
  S(g).stage = true;
  g.emit('kittyHouse', { work: STAGE });
  return addKitty(g, STAGE);
}
export const slotCost = g => { const n = stageKitties(g).length; return n < STAGE_MAX ? D(g).unlock[n].gem : null; };
export function addStageKitty(g) {
  const cost = slotCost(g);
  if (!S(g).stage || cost == null || g.state.gem < cost) return null;
  g.state.gem -= cost;
  return addKitty(g, STAGE);
}

// ---- hearts: fish are the food (UI_UnitInfo gives Fish.heartValue, UnitInfo.c:13156) ----
export function addHeart(g, k, value) {
  k = typeof k === 'object' ? k : kitty(g, k);
  if (!k || !(value > 0)) return null;
  const was = heartInfo(g, k.exp).level;
  k.exp += value;
  const level = heartInfo(g, k.exp).level;
  if (level > was) g.emit('kittyHeart', { kitty: k, level });
  return { level, was };
}
export function feed(g, id, fish) {
  const k = kitty(g, id);
  const inv = g.state.fishing && g.state.fishing.inv[fish];
  if (!k || !inv || inv.n - inv.a < 1) return null;
  inv.n -= 1;
  if (!inv.n) delete g.state.fishing.inv[fish];
  const value = g.fishTable.get(fish).heartValue;
  addHeart(g, k, value);
  g.emit('kittyFeed', { kitty: k, fish, value });
  return value;
}

// KittyAbility: 1 souvenir token (house 402), 2 butterfly (403), 3 magnet (404), 0 just cute (dance stage). The value is the
// UnitHeart column of the kitty living in that house at its heart level (tokenUp / butterflyUp / magnetUp, percent).
const COLUMN = { 1: 'tokenUp', 2: 'butterflyUp', 3: 'magnetUp' };
export function bonus(g, type) {
  const a = ability(g, type);
  const k = a && inHouse(g, a.work);
  if (!k) return 0;
  return g.t.UnitHeart[heartInfo(g, k.exp).level - 1][COLUMN[type]] || 0;
}
export const butterflyBonus = g => bonus(g, 2);

// ---- shop: the travel item shop sells TravelItem rows for golden butterflies (TravelItem.price; msg_shortTravel) ----
export function buy(g, index, n = 1) {
  const it = item(g, index);
  if (!it || n < 1 || count(g, BUTTERFLY) < it.price * n) return false;
  take(g, BUTTERFLY, it.price * n);
  g.reward(itemType(index), n, { from: 'kittyShop' });
  g.emit('kittyBuy', { item: index, n, price: it.price * n });
  return true;
}

// ---- trip ----
// GotoKittyTravel (DataManager.c:22147): at most one item of each type (snack 0, essential 1, ticket 2), all owned; a ticket's
// itemValue (seconds) shortens the 18000 s trip (TravelItem.get_DecreaseTime = itemValue of a ticket).
export function tripSeconds(g, items) {
  let sec = TRAVEL_BASE;
  for (const i of items) { const it = item(g, i); if (it && it.type === 2) sec -= it.value; }
  return sec;
}
export function validItems(g, items) {
  const types = new Set();
  for (const i of items) {
    const it = item(g, i);
    if (!it || types.has(it.type)) return false;
    types.add(it.type);
  }
  return true;
}
export function canTravel(g, id, items = []) {
  const k = kitty(g, id);
  if (!k || k.trip || k.house === STAGE || !HOUSES.includes(k.house) || !validItems(g, items)) return false;
  return items.every(i => itemCount(g, i) >= 1);
}
export function travel(g, id, items = []) {
  if (!canTravel(g, id, items)) return null;
  const k = kitty(g, id);
  for (const i of items) take(g, itemType(i), 1);
  const total = tripSeconds(g, items);
  k.trip = { items: items.slice(), left: total, total };
  S(g).stats.trips += 1;
  g.emit('kittyTravel', { kitty: k, items: k.trip.items, seconds: total });
  return k.trip;
}
export const tripDone = k => !!k.trip && k.trip.left <= 0;
// CancelTravel (DataManager.c:14382): the items go back, nothing else is paid.
export function cancel(g, id) {
  const k = kitty(g, id);
  if (!k || !k.trip) return false;
  for (const i of k.trip.items) give(g, i, 1);
  k.trip = null;
  g.emit('kittyCancel', { kitty: k });
  return true;
}

// ReturnKittyFromTravel (DataManager.c:58864). destType = essential item's itemValue (0-4 a region, 5 compass = any regular
// destination), else a random region 0-4; the destination is random in the region; a photo with a random picture of it
// is saved; a magnet may drop, else 3-6 extra souvenir tokens (Random.Range(3, 7), upper bound exclusive); the souvenir kitty's tokens (20 + tokenUp) always come.
export function pickDest(g, items) {
  const essential = items.map(i => item(g, i)).find(it => it && it.type === 1);
  let region = essential ? essential.value : rnd(g, REGIONS);
  if (region === ESSENTIAL_COMPASS || region >= REGIONS) region = -1;
  const list = D(g).dests.filter(d => region < 0 || d.region === region);
  return list[rnd(g, list.length)];
}
// The decompile skips the magnet when a 0-99 roll is <= min(100, magnetProb - extra) (DataManager.c:59503-59560): extra is the
// magnetUp of the kitty in house 404. The name TravelMagnetProbability reads the other way round (inferred), see kitty.md.
export const noMagnetPercent = g => Math.max(0, Math.min(100, D(g).balance.magnetProb - bonus(g, 3)));
export function pickMagnet(g, d) {
  const rows = D(g).magnets.filter(m => m.dest === d.index);
  if (!rows.length) return null;
  const skip = noMagnetPercent(g);
  if (skip > 0 && rnd(g, 100) <= skip) return null;
  let r = rnd(g, rows.reduce((a, m) => a + m.prob, 0));
  for (const m of rows) { if (r < m.prob) return m; r -= m.prob; }
  return rows[rows.length - 1];
}
export const tokensFor = g => D(g).balance.defaultToken + bonus(g, 1);

export function collect(g, id) {
  const k = kitty(g, id);
  if (!k || !tripDone(k)) return null;
  const items = k.trip.items;
  const d = pickDest(g, items);
  const pics = d.pics.filter(p => pic(g, p));
  const p = pic(g, pics[rnd(g, pics.length)]);
  const snack = items.find(i => item(g, i).type === 0) || 0;
  const photo = { dest: d.index, pic: p[0], pose: p[1], kitty: k.type, snack, petPos: p[6] + rnd(g, p[7] - p[6] + 1), at: g.state.clock };
  const m = pickMagnet(g, d);
  const bal = D(g).balance;
  let tokens = tokensFor(g);
  if (!m) tokens += bal.tokenMin + rnd(g, bal.tokenMax - bal.tokenMin);
  k.trip = null;
  const s = S(g);
  s.stats.photos += 1;
  // UI_TravelPhotoAgree: a second photo of a destination asks which one to keep; leaving it unanswered keeps the old one.
  if (s.album[d.index]) s.pending = { dest: d.index, photo };
  else s.album[d.index] = photo;
  if (m) { g.reward(MAGNET, m.index, { from: 'kitty' }); s.stats.magnets += 1; }
  g.reward(TOKEN, tokens, { from: 'kitty' });
  s.stats.tokens += tokens;
  const out = { kitty: k, dest: d, photo, magnet: m, tokens, pending: !!(s.pending && s.pending.photo === photo) };
  g.emit('kittyReturn', out);
  return out;
}
export function choosePhoto(g, keepNew) {
  const s = S(g);
  if (!s.pending) return false;
  if (keepNew) s.album[s.pending.dest] = s.pending.photo;
  s.pending = null;
  g.emit('kittyAlbum', { keepNew: !!keepNew });
  return true;
}
export const albumList = g => D(g).dests.filter(d => S(g).album[d.index]).map(d => S(g).album[d.index]);
export const magnetCount = g => Object.values(S(g).magnets).reduce((a, n) => a + n, 0);

export default {
  id: 'kitty',
  bag: g => S(g).held,
  data: ['kitty'],

  init(g) {
    if (!g.state.kitty) g.state.kitty = { nextId: 1, houses: [], stage: false, kitties: [], album: {}, pending: null, magnets: {}, held: {}, stats: {} };
    const s = g.state.kitty;
    s.held ||= {}; s.album ||= {}; s.magnets ||= {};
    s.stats = { trips: 0, photos: 0, magnets: 0, tokens: 0, ...s.stats };
  },
  tick(g, dt) {
    for (const k of S(g).kitties) {
      if (!k.trip || k.trip.left <= 0) continue;
      k.trip.left -= dt;
      if (k.trip.left <= 0) { k.trip.left = 0; g.emit('kittyReady', { kitty: k }); }
    }
  },
  // The trip clock of the original is wall time (DateTime), so the whole time away counts, not the capped part.
  offline(g, sec, raw) {
    for (const k of S(g).kitties) {
      if (!k.trip || k.trip.left <= 0) continue;
      k.trip.left = Math.max(0, k.trip.left - raw);
      if (k.trip.left <= 0) g.emit('kittyReady', { kitty: k });
    }
  },
  rewards: {
    [MAGNET]: (g, value) => { const m = S(g).magnets; m[value] = (m[value] || 0) + 1; return { type: MAGNET, value, stored: true }; },
  },
  HOUSES, STAGE, TRAVEL_BASE, BUTTERFLY, TOKEN, MAGNET, ITEM_BASE,
  item, itemType, dest, pic, ability, count, itemCount, kitties, kitty, inHouse, stageKitties, heart, randomType, addKitty,
  canBuildHouse, buildHouse, nextHouse, canBuildStage, buildStage, slotCost, addStageKitty, stageNeedsBuilt,
  addHeart, feed, bonus, butterflyBonus, buy, tripSeconds, validItems, canTravel, travel, tripDone, cancel,
  pickDest, noMagnetPercent, pickMagnet, tokensFor, collect, choosePhoto, albumList, magnetCount,
};
