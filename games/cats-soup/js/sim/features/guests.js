// Feature "guests" (sim part): life in the forest beyond the working cats. Contract: js/sim/registry.js.
// Rules and citations: D:/catsoup-ref/rules/guests.md. Data: data/guests.json (tools/export_guests.py), Work.json type 21.
//
// State game.state.guests:
//   list [±idx]   DataManager.ltGuest (GameData.ltGuest): +idx = guest on, -idx = owned but off (GuestOnOff flips the sign)
//   visits [{id, idx, v, t}]  guest vehicles crossing the forest (Spawn.SledOn / GuestObject.MoveCoroutine), t = seconds
//   blocks {a: n}  owned deco blocks per Work index 3001.. (dicDecoBlockCount); on the field or in the forest storage
//   weather {rainy}  Spawn.JudgeWeather result, rolled once per day step
//   frog / snail {on, t, ...}  GameNPCManager's two NPCs (frog prince in the rain, snail otherwise)
//   butterfly {ready, last}  Butterfly (work 401's lastTargetTime); the golden butterflies themselves (reward type 98) are held by missions
//   hidden {on, t, quiz, last, rare}  ThemeNpc_HiddenGuest of theme 14 (Halloween quiz, ThemeHiddenNpc.json)
//   wish [[kind, index]]  DataManager.dicWishlist (kind 'equip' | 'furniture')
//   seen  day step of the last guest check
// Events: guestGet {idx}, guestOnOff {idx, on}, guestVisit {idx}, frogGift {work: null, energy, ads}, snail {gold}, butterfly {points, ads},
// hiddenNpc {quiz, correct}, decoBuy {a}, decoPlace {a}, wishAdd {kind, index}, wishDel {kind, index}.
// Reward types handled here: 89 deco block (DataManager.GetReward_Inner case 0x59). Type 98 (case 0x62) is paid through game.reward.
import * as B from '../big.js';

export const GUEST_MAX_INIT = 61;      // Init 61 GuestMaxCount = 10
export const DISCOUNT_STEP = 0.03;     // DataManager.GuestDiscount: 0.03 x Min(count, 5), at most 15 %
export const DISCOUNT_CAP = 5;
export const VISIT_SECONDS = 15;       // GuestObject.MoveCoroutine: deactivates after 15 s
export const VISIT_SPEED = 5;          // GuestObject.MoveStart: speed = 5
export const FROG_INIT = 11;           // Init 11 Income_Frog = 3600 s of average energy income
export const SNAIL_INIT = 31;          // Init 31 Income_Snail = 10 s of average gold income
export const FROG_FREE_DIVIDE = 20;    // UI_Frog.Reward_Energy: the free button pays energy / 20, the ad button the whole amount
export const FROG_ABILITY_SUB = 1006;  // Ability type 11 subIndex 1006 = frog prince gift (collection bonus)
export const NPC_REFRESH = 10;         // GameNPCManager.m_RefreshSecTime (prefab) = 10 s
export const NPC_LIFE = 60;            // Npc_Frog / Npc_Snail m_NPCLifeTime (prefab) = 60 s
export const NPC_MIN_CATS = 3;         // GameNPCManager.Update: fewer than 3 (units) and both NPCs are deactivated
export const SNAIL_FIRST = 60;         // GetRemainCoolTime: 60 s after the first / after a missed spawn
export const SNAIL_AFTER_REWARD = 120; // and 120 s after a reward
export const RAIN_CHANCE = 1 / 3;      // (inferred) Spawn.JudgeWeather rolls RandomValue(3) == 2 in the rainy themes
export const BUTTERFLY_BASE = 10;      // Butterfly.AfterReward: (AddButterflyPoint + 10) << viewAds
export const BUTTERFLY_WORK = 401;     // Butterfly stores its cooldown on work 401 (completeTime 300 s)
export const BUTTERFLY_COOLDOWN = 300;
export const BUTTERFLY_TYPE = 98;      // reward type 0x62
export const DECO_TYPE = 89;           // reward type 0x59
export const HIDDEN_THEME = 14;        // ThemeNpc_HiddenGuest_Theme14 (theme_type 1)
export const HIDDEN_RARE = 25;         // Theme14.Init: RandomValue(100) < 25 picks a rare question
export const WISH_MAX = 99;            // DataManager.AddWishlist: GetConstMax = 99 for equipment / furniture lists
export const DECO_FIRST = 3001;        // AddRewardDecoBlock accepts indices 0xBB9 .. 0xBB9 + 998

const S = g => g.state.guests;
const D = g => g.data.guests;
const memo = (g, key, build) => (g[key] ||= build());
const guestMap = g => memo(g, '_guMap', () => new Map(D(g).guest.map(r => [r.index, r])));
const blockMap = g => memo(g, '_guBlk', () => new Map(D(g).blocks.map(r => [r.index, r])));
const cats = g => g.state.cats.length;

export const guestRow = (g, i) => guestMap(g).get(i);
export const guestList = g => D(g).guest;
export const blockRow = (g, a) => blockMap(g).get(a);
export const blockList = g => D(g).blocks;

// ---- guests (DataManager.AddGuest / GuestValue / GuestOnOff / GuestOnCount / IsPossessGuest / GuestDiscount) ----
export const guestValue = (g, i) => S(g).list.find(v => Math.abs(v) === i) || 0;
export const isPossess = (g, i) => guestValue(g, i) !== 0;
export const isOn = (g, i) => guestValue(g, i) > 0;
export const onCount = g => S(g).list.filter(v => v > 0).length;
export const ownedCount = g => S(g).list.length;
export const maxOn = g => g.t.Init.find(r => r.index === GUEST_MAX_INIT).value;

export function addGuest(g, i) {                 // AddGuest: already owned (on or off) does nothing; a new one starts on
  if (!guestRow(g, i) || isPossess(g, i)) return false;
  S(g).list.push(i);
  g.emit('guestGet', { idx: i });
  return true;
}

// UI_CollectGuest.CheckComplete: every equip of collectValue must be owned at targetLevel (six per row, collectType 5).
export function needEquips(g, i) {
  const r = guestRow(g, i);
  return r && r.collectType === 5 ? r.collectValue.split(',').filter(Boolean).map(Number) : [];
}
export function equipLevel(g, e) { return g.feat.equip ? g.feat.equip.level(g, e) : 0; }
export function missing(g, i) {
  const r = guestRow(g, i);
  return needEquips(g, i).filter(e => equipLevel(g, e) < r.targetLevel);
}
export const canCollect = (g, i) => !!guestRow(g, i) && !isPossess(g, i) && needEquips(g, i).length > 0 && !missing(g, i).length;
// UI_CollectGuest.GetGuest: the guest is given when complete, else the toast msg_shortGuestCondition.
export function collect(g, i) { return canCollect(g, i) ? addGuest(g, i) : false; }

// GuestOnOff: not owned -> 0; flips the sign. UI_Theme refuses to turn one on when GuestOnCount >= Init 61 (popup_guest_max_message01).
export function onOff(g, i) {
  const s = S(g);
  const at = s.list.findIndex(v => Math.abs(v) === i);
  if (at < 0) return 0;
  if (s.list[at] < 0 && onCount(g) >= maxOn(g)) return 0;
  s.list[at] = -s.list[at];
  g.emit('guestOnOff', { idx: i, on: s.list[at] > 0 });
  return s.list[at];
}

// DataManager.GuestDiscount counts every non-zero entry of ltGuest (on or off), 0.03 each, Min(count, 5) (the Min is inferred).
export const discount = g => DISCOUNT_STEP * Math.min(ownedCount(g), DISCOUNT_CAP);
// DataManager.GetWorkUpgradeCost multiplies the cost by (1 - swan discount) - GuestDiscount; as a plain factor 1 - discount.
export const upgradeFactor = (g, base = 1) => base - discount(g);

// ---- guest vehicles on the map (Spawn.CheckGuest, called from the day clock, Spawn.SledOn, GuestObject) ----
// Variant 0 starts 15 cells east and 6 north of the forest centre and moves toward -x; variant 1 starts 6 east and 15 north
// and moves toward +z, both at 5 units / s for 15 s (GuestObject.MoveStart).
export function checkGuest(g) {                  // Spawn.CheckGuest: one random ON guest starts its run
  const s = S(g);
  const on = s.list.filter(v => v > 0);
  if (!on.length) return null;
  const idx = on[Math.floor(g.rng() * on.length)];
  if (s.visits.some(v => v.idx === idx)) return null;      // SledOn reuses the guest already on the map
  const v = { id: g.state.nextId++, idx, v: Math.floor(g.rng() * 2), t: 0 };
  s.visits.push(v);
  g.emit('guestVisit', { idx });
  return v;
}
export const visitPos = v => (v.v === 0 ? [15 - VISIT_SPEED * v.t, -6] : [6, -15 + VISIT_SPEED * v.t]);   // [x, z] around the forest centre

// ---- weather, frog prince and snail (GameNPCManager.Update every 10 s) ----
export const rainy = g => S(g).weather.rainy;
export function setRain(g, on) { S(g).weather.rainy = !!on; return on; }
export function rollWeather(g) { return setRain(g, g.rng() < RAIN_CHANCE); }

function emptyCell(g) {                           // Npc_Base.ActiveNPC: a random free work cell ("Not enough remain field" otherwise)
  const c = g.emptyCells();
  return c.length ? c[Math.floor(g.rng() * c.length)] : null;
}
export function activeNpc(g) { return S(g).frog.on ? 'frog' : S(g).snail.on ? 'snail' : 'none'; }
function activate(g, n) {
  const cell = emptyCell(g);
  if (!cell) return false;
  Object.assign(n, { on: true, t: 0, cell: cell.slice() });
  return true;
}
const income = (g, kind) => g.t.Init.find(r => r.index === kind).value;

// Energy the frog prince holds: avgEnergy x Init 11 x (1 + the frog-gift collection bonus %), DataManager.GetFrogEnergy.
export function frogEnergy(g) {
  const col = g.feat.collection && g.feat.collection.subPercent ? g.feat.collection.subPercent(g, FROG_ABILITY_SUB) : 0;
  const avg = g.feat.cats && g.feat.cats.averageEnergy ? g.feat.cats.averageEnergy(g) : B.ZERO;
  return B.mul(avg, income(g, FROG_INIT) * (1 + col / 100));
}
export const snailGold = g => B.mul(g.averageIncome(), income(g, SNAIL_INIT));

// UI_Frog: free button = energy / 20, ad button (pays at once in this build) = the whole amount. Both end the visit.
export function claimFrog(g, ads = false) {
  const f = S(g).frog;
  if (!f.on) return null;
  const e = ads ? frogEnergy(g) : B.div(frogEnergy(g), FROG_FREE_DIVIDE);
  g.state.energy = B.add(g.state.energy, e);
  leave(g, f);
  g.emit('frogGift', { energy: e, ads });
  return e;
}
// UI_Frog.RewardAds_EventItem: snail reward only through the ad button; the event item is replaced by gold (specials.md: Init 31).
export function claimSnail(g) {
  const n = S(g).snail;
  if (!n.on) return null;
  const gold = snailGold(g);
  g.state.gold = B.add(g.state.gold, gold);
  n.last = g.state.clock;
  n.rewarded = true;
  n.first = true;
  leave(g, n, true);
  g.emit('snail', { gold });
  return gold;
}
function leave(g, n, rewarded = false) {
  n.on = false;
  n.t = 0;
  if (!rewarded) n.gone = g.state.clock;
}
// GetRemainCoolTime: the snail waits 60 s after the start or a missed spawn and 120 s after a reward.
export function snailWait(g) {
  const n = S(g).snail;
  const since = g.state.clock - (n.rewarded ? n.last : n.gone);
  return Math.max(0, (n.rewarded ? SNAIL_AFTER_REWARD : SNAIL_FIRST) - since);
}

// One 10 s GameNPCManager.Update.
export function npcStep(g) {
  const s = S(g);
  if (cats(g) < NPC_MIN_CATS) { s.frog.on = false; s.snail.on = false; return; }
  if (s.weather.rainy) {
    if (s.snail.on) leave(g, s.snail);
    if (s.frog.on) { if (s.frog.t >= NPC_LIFE) leave(g, s.frog); return; }
    activate(g, s.frog);
    return;
  }
  if (s.frog.on) leave(g, s.frog);
  if (s.snail.on) { if (s.snail.t >= NPC_LIFE) { leave(g, s.snail); } return; }
  if (snailWait(g) <= 0) activate(g, s.snail);
}

// ---- butterfly (Butterfly.ButterflyEvent / AfterReward, cooldown = Work 401 completeTime) ----
// Golden butterflies (reward type 98) are held by missions / collection (itemCount 98); this feature only pays them.
export const butterflies = g => (g.feat.collection ? g.feat.collection.itemCount(g, BUTTERFLY_TYPE) : 0);
export const butterflyReady = g => S(g).butterfly.ready;
export function butterflyBonus(g) {              // AddButterflyPoint: sum of the heart butterflyUp of the kitties (no kitties here)
  const k = g.feat.kitty && g.feat.kitty.butterflyBonus ? g.feat.kitty.butterflyBonus(g) : 0;
  return k || 0;
}
export function claimButterfly(g, ads = false) {
  const b = S(g).butterfly;
  if (!b.ready) return 0;
  const n = (butterflyBonus(g) + BUTTERFLY_BASE) << (ads ? 1 : 0);
  b.ready = false;
  b.last = g.state.clock;
  g.reward(BUTTERFLY_TYPE, n);
  g.emit('butterfly', { points: n, ads });
  return n;
}

// ---- hidden theme guest (theme 14: Halloween quiz) ----
export const hiddenQuestions = (g, rare) => D(g).hidden.filter(r => r.theme_type === 1 && (r.question_type === 'rare') === rare);
export const themeNow = g => (g.state.theme ? g.state.theme.theme : 0);
export function hiddenStart(g) {
  const h = S(g).hidden;
  const rare = Math.floor(g.rng() * 100) < HIDDEN_RARE;
  const list = hiddenQuestions(g, rare);
  h.quiz = list[Math.floor(g.rng() * list.length)].index;
  h.rare = rare;
  h.on = true;
  h.t = 0;
  return h.quiz;
}
export const quizRow = (g, i) => D(g).hidden.find(r => r.index === i);
// The three answers in a fixed shuffle seeded by the quiz index (the original shuffles them on screen).
export function quizAnswers(g, i) {
  const r = quizRow(g, i);
  const a = [r.question_correct, r.question_wrong1, r.question_wrong2];
  const k = i % 3;
  return a.map((_, n) => a[(n + k) % 3]);
}
export function answerHidden(g, answer) {
  const h = S(g).hidden;
  if (!h.on) return null;
  const r = quizRow(g, h.quiz);
  const correct = answer === r.question_correct;
  const type = correct ? r.correct_rewardType : r.wrong_rewardType;
  const value = correct ? r.correct_rewardValue : r.wrong_rewardValue;
  g.reward(type, value);
  h.on = false;
  h.last = g.state.clock;
  g.emit('hiddenNpc', { quiz: h.quiz, correct });
  return { correct, type, value };
}

// ---- deco blocks (Work type 21; DataManager.AddRewardDecoBlock / GetDecoBlockCount / IsOwnedDecoBlock) ----
export const isBlock = a => { const r = a >= DECO_FIRST && a < DECO_FIRST + 999; return r; };
export const blockCount = (g, a) => S(g).blocks[a] || 0;
export const placedBlocks = (g, a) => g.state.works.filter(w => w.a === a).length;
export const storedBlocks = (g, a) => (g.state.storage || []).filter(w => w.a === a).length;
// Blocks of the stock that are not on the field (DataManager.GetDecoBlockStorageCount).
export const spareBlocks = (g, a) => Math.max(0, blockCount(g, a) - placedBlocks(g, a) - storedBlocks(g, a));
export const hasAnyBlock = g => Object.values(S(g).blocks).some(n => n > 0);
export const decoCost = (g, a) => { const r = blockRow(g, a); return r ? r.blockCostValue : 0; };
export const decoCurrency = (g, a) => { const r = blockRow(g, a); return r ? r.blockCostType : 4; };
export const shopList = g => D(g).blocks.filter(r => r.blockShopType === 0);     // blockShopType 1 = limited, not sold here
export const isLimit = (g, a) => blockCount(g, a) >= blockRow(g, a).maxStorage;  // UIBlockShop.BlockSlot.IsLimit

export function addBlock(g, a, n = 1) {          // AddRewardDecoBlock: index in range, cnt > 0, stock capped at maxStorage
  const r = blockRow(g, a);
  if (!r || n < 1 || !isBlock(a)) return 0;
  const add = Math.min(n, r.maxStorage - blockCount(g, a));
  if (add <= 0) return 0;
  S(g).blocks[a] = blockCount(g, a) + add;
  return add;
}
// UIBlockShop.BlockSlot.CanBuyBlock: not at the limit and the currency covers cost x count (1 gold, 2 energy, 3 gems, 4 coins).
export function canBuyBlock(g, a, n = 1) {
  const r = blockRow(g, a);
  if (!r || r.blockShopType !== 0 || blockCount(g, a) + n > r.maxStorage) return false;
  const c = r.blockCostValue * n;
  const s = g.state;
  if (r.blockCostType === 3) return s.gem >= c;
  if (r.blockCostType === 4) return s.coin >= c;
  return false;
}
export function buyBlock(g, a, n = 1) {
  if (!canBuyBlock(g, a, n)) return false;
  const r = blockRow(g, a);
  const c = r.blockCostValue * n;
  if (r.blockCostType === 3) g.state.gem -= c; else g.state.coin -= c;
  addBlock(g, a, n);
  g.emit('decoBuy', { a, n });
  return true;
}
// Spawn.BuildDecoBlock: onto an empty cell of the field (else "no empty cell"). Deco blocks do not count for forest expansion
// (core ownedCount skips type 21).
export function placeBlock(g, a, cell = null) {
  if (!isBlock(a) || spareBlocks(g, a) < 1) return null;
  const c = cell || g.autoCell();
  if (!c || !g.inField(c[0], c[1]) || g.workAt(c[0], c[1])) return null;
  const w = g.place(a, c, 0);
  g.emit('decoPlace', { a, work: w });
  return w;
}
// Take a placed block back to the stock (the keep button of move mode: core keepWork) - spare again.
export function pickBlock(g, work) { return g.keepWork(work); }

// ---- wishlist (DataManager.AddWishlist / DeleteWishlist / CheckWishlistAll) ----
export const wishList = g => S(g).wish;
export const wished = (g, kind, i) => S(g).wish.some(w => w[0] === kind && w[1] === i);
export function owns(g, kind, i) {
  if (kind === 'equip') return !!g.feat.equip && g.feat.equip.owned(g, i);
  if (kind === 'furniture') return !!g.feat.furniture && g.feat.furniture.owns(g, i);
  return false;
}
export function addWish(g, kind, i) {
  const s = S(g);
  const known = kind === 'equip' ? g.t.Equip.some(e => e.index === i) : kind === 'furniture' ? g.t.Furniture.some(e => e.index === i) : false;
  if (!known || wished(g, kind, i) || s.wish.filter(w => w[0] === kind).length >= WISH_MAX) return false;
  s.wish.push([kind, i]);
  g.emit('wishAdd', { kind, index: i });
  return true;
}
export function delWish(g, kind, i) {
  const s = S(g);
  const at = s.wish.findIndex(w => w[0] === kind && w[1] === i);
  if (at < 0) return false;
  s.wish.splice(at, 1);
  g.emit('wishDel', { kind, index: i });
  return true;
}
// CheckWishlistAll: a wished item that is now owned leaves the list ("buying it removes it from the wishlist").
export function checkWish(g) {
  const gone = S(g).wish.filter(([k, i]) => owns(g, k, i));
  for (const [k, i] of gone) delWish(g, k, i);
  return gone;
}

// ---- tick ----
const fresh = () => ({
  list: [], visits: [], blocks: {}, weather: { rainy: false },
  frog: { on: false, t: 0 }, snail: { on: false, t: 0, gone: 0, last: 0, rewarded: false, first: false },
  butterfly: { ready: false, last: 0 },
  hidden: { on: false, t: 0, quiz: -1, last: 0, rare: false }, wish: [], seen: 0, acc: 0,
});

export default {
  id: 'guests',
  data: ['guests'],
  init(g) {
    const s = g.state;
    if (!s.guests) s.guests = fresh();
    s.guests.seen = s.timeCount;
    for (const k of ['visits', 'wish', 'list']) s.guests[k] ||= [];
    s.guests.blocks ||= {};
  },
  tick(g, dt) {
    const s = S(g);
    const clock = g.state.clock;
    if (s.seen !== g.state.timeCount) {            // every day step the clock moves (core adds 1 to timeCount each 60 s)
      s.seen = g.state.timeCount;
      rollWeather(g);
      checkGuest(g);
      g.emit('weather', { rainy: s.weather.rainy });
    }
    for (const v of s.visits) v.t += dt;
    s.visits = s.visits.filter(v => v.t <= VISIT_SECONDS);
    if (s.frog.on) s.frog.t += dt;
    if (s.snail.on) s.snail.t += dt;
    s.acc += dt;
    while (s.acc >= NPC_REFRESH) { s.acc -= NPC_REFRESH; npcStep(g); }
    if (!s.butterfly.ready && clock - s.butterfly.last >= BUTTERFLY_COOLDOWN && cats(g) >= NPC_MIN_CATS) s.butterfly.ready = true;
    const h = s.hidden;
    if (h.on) { h.t += dt; if (h.t >= 120) { h.on = false; h.last = clock; } }
    else if (themeNow(g) === HIDDEN_THEME && cats(g) >= NPC_MIN_CATS && clock - h.last >= 600) hiddenStart(g);
  },
  onEvent(g, e) {
    if (e.type === 'build' || e.type === 'upgrade' || e.type === 'sell') { if (g.state.guests && g.state.guests.wish.length) checkWish(g); }
  },
  rewards: {
    [DECO_TYPE]: (g, v) => (addBlock(g, Number(v), 1) ? { type: DECO_TYPE, value: v } : null),
  },
  mult(g, kind) { return kind === 'upgrade' ? 1 - discount(g) : 1; },
  guestRow, guestList, guestValue, isPossess, isOn, onCount, ownedCount, maxOn, addGuest, needEquips, missing, canCollect, collect, onOff, discount,
  upgradeFactor, checkGuest, visitPos, rainy, setRain, rollWeather, activeNpc, frogEnergy, snailGold, claimFrog, claimSnail, snailWait, npcStep,
  butterflies, butterflyReady, claimButterfly, hiddenStart, hiddenQuestions, quizRow, quizAnswers, answerHidden,
  isBlock, blockRow, blockList, blockCount, placedBlocks, storedBlocks, spareBlocks, hasAnyBlock, decoCost, decoCurrency, shopList, isLimit,
  addBlock, canBuyBlock, buyBlock, placeBlock, pickBlock, wishList, wished, owns, addWish, delWish, checkWish,
};
