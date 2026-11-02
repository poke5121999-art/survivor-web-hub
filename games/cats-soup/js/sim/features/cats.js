// Feature "cats" (sim part): hearts, cat skills, cat gifts, moving cats between facilities. Contract: js/sim/registry.js.
// Rules and citations: D:/catsoup-ref/rules/cats-full.md. Tables come from data/tables.json (UnitHeart, Ability, LFactor, CatGift).
//
// State: core keeps game.state.cats = [{id, type, work, heart}] and reads E.HEART_MATERIAL[cat.heart], so `cat.heart` stays the
// 0-based heart LEVEL (kept in step by addHeart). Everything else lives in game.state.cats_ext:
//   { byId: { <catId>: { exp, main: {a, lv}, sub: <abilityIndex>|null } }, gift: {...}, stash: { <rewardType>: n } }
import * as B from '../big.js';
import * as E from '../economy.js';

export const GIFT_BOXES = 3;        // set_unitgift set_select: three boxes, pick one (msg_selectGift), ads take the rest (inferred count)
export const GIFT_SECONDS = 600;    // time between two gift bubbles (bt_unitGift); not recovered from code (inferred)
const MAIN = 101, SUB = 102;        // Ability.type of cat main skill / sub skill
const FIRST_SKILL = { a: 1001, lv: 2 };   // first cat: carrot (Ability.subIndex 1) at level 2 (cats.md section 3)

const ext = g => g.state.cats_ext;

// ---- hearts (UnitHeart.json) ----
const hearts = g => g.t.UnitHeart;

// DataManager.GetUnitHeartInfo: cumulative exp -> level (1-based), exp inside the level, exp the level needs (0 at max).
export function heartInfo(g, exp) {
  const rows = hearts(g);
  let left = Math.max(0, exp);
  for (let i = 1; i < rows.length; i++) {
    if (left < rows[i].exp) return { level: i, into: left, need: rows[i].exp, toNext: rows[i].exp - left };
    left -= rows[i].exp;
  }
  return { level: rows.length, into: 0, need: 0, toNext: 0 };
}

export const heartLevel = (g, cat) => heartInfo(g, ext(g).byId[cat.id].exp).level;
export const heartRow = (g, cat) => hearts(g)[heartLevel(g, cat) - 1];
// key: materialUp | energyUp | priceUp | criticalUp | tokenUp | butterflyUp | magnetUp (percent)
export const heartBonus = (g, cat, key) => heartRow(g, cat)[key];

export function addHeart(g, cat, value) {
  cat = typeof cat === 'object' ? cat : g.state.cats.find(c => c.id === cat);
  if (!cat || !(value > 0)) return null;
  const x = ensureCat(g, cat);
  const was = heartInfo(g, x.exp).level;
  x.exp += value;
  const level = heartInfo(g, x.exp).level;
  cat.heart = level - 1;
  if (level > was) g.emit('heartLevel', { cat, level });
  return { level, was };
}

// ---- skills (Ability.json type 101 main, 102 sub; LFactor.json multipliers) ----
const abilities = g => (g._catsAb ||= new Map(g.t.Ability.map(a => [a.index, a])));
export const ability = (g, index) => abilities(g).get(index);
const rowsOf = (g, type) => g.t.Ability.filter(a => a.type === type && !a.eventType);

// DataManager.GetAbilityValue: initValue x LFactor[lv-1], lv clamped to >= 1.
export function abilityValue(g, ab, lv) {
  const f = g.t.LFactor;
  return ab.initValue * f[Math.min(Math.max(1, lv), f.length) - 1].value;
}

// SetUnitSkillLevel: r = rand(1000) in 1..1000, <=400 -> 1, <=700 -> 2, <=900 -> 3, <=980 -> 4, else 5.
export function rollSkillLevel(r) { return r <= 400 ? 1 : r <= 700 ? 2 : r <= 900 ? 3 : r <= 980 ? 4 : 5; }

function rollSkills(g, first) {
  const rnd = n => Math.floor(g.rng() * n);
  const mains = rowsOf(g, MAIN);
  let main = first ? { ...FIRST_SKILL } : { a: mains[rnd(mains.length)].index, lv: rollSkillLevel(rnd(1000) + 1) };
  // GetUnitSpecialSkillRate: rand(1000) > 800 gives a sub skill (about 20 %)
  const subs = rowsOf(g, SUB);
  const sub = rnd(1000) + 1 > 800 ? subs[rnd(subs.length)].index : null;
  return { main, sub };
}

// Creates a cat's extra record (idempotent). Cats made before this feature existed start at the exp of their heart level.
export function ensureCat(g, cat) {
  const e = ext(g) || initSlice(g);
  let x = e.byId[cat.id];
  if (!x) {
    const first = g.state.cats[0] === cat;
    let exp = 0;
    for (let i = 1; i <= (cat.heart || 0) && i < hearts(g).length; i++) exp += hearts(g)[i].exp;
    x = e.byId[cat.id] = { exp, ...rollSkills(g, first) };
  }
  return x;
}

export const mainSkill = (g, cat) => {
  const m = ensureCat(g, cat).main;
  return { ability: ability(g, m.a), lv: m.lv };
};
export const subSkill = (g, cat) => {
  const s = ensureCat(g, cat).sub;
  return s == null ? null : { ability: ability(g, s), lv: 1, value: abilityValue(g, ability(g, s), 1) };
};

// The main skill only works at the facility it names (Ability.subIndex == Work.index); msg_skillMatch.
export function skillMatch(g, cat, work = g.state.works.find(w => w.id === cat.work)) {
  return !!work && mainSkill(g, cat).ability.subIndex === work.a;
}

// Unit._skillFactor_normal (DataManager.CalculateUnitSkill): 1 + value% when the cat sits at the matching facility.
// CORE HOOK: Game.stars() multiplies E.gradeValue(...) by (1 + HEART_MATERIAL/100); it also has to multiply by this.
export function skillFactor(g, cat, work = g.state.works.find(w => w.id === cat.work)) {
  if (!skillMatch(g, cat, work)) return 1;
  const m = mainSkill(g, cat);
  return 1 + abilityValue(g, m.ability, m.lv) * 0.01;
}

// Sum of the sub skill percent of every cat for a sub ability (abilityS_1001..1006); consumers: photo, jar fairy, balloon,
// special order, offline time, frog prince (specials/missions features).
export function subSkillPercent(g, abilityIndex) {
  let sum = 0;
  for (const c of g.state.cats) { const s = subSkill(g, c); if (s && s.ability.index === abilityIndex) sum += s.value; }
  return sum;
}

// ---- moving cats between facilities (UI_Units / UI_CatSwap) ----
// Swaps the facilities of two cats (a cat dropped on an occupied facility trades places with its cat).
export function swap(g, a, b) {
  if (!a || !b || a === b) return false;
  [a.work, b.work] = [b.work, a.work];
  g.ai.cats.delete(a.id);   // the walking routine restarts at the new facility
  g.ai.cats.delete(b.id);
  g.emit('catSwap', { a, b });
  return true;
}

export function moveTo(g, cat, work) {
  const other = g.catOf(work);
  return other ? swap(g, cat, other) : false;
}

// "Move all" (swap_allcat): every cat whose skill matches no facility goes to a facility its skill names, trading with
// the cat there when that one is not already matched. Returns the number of swaps.
export function bestFit(g) {
  let n = 0;
  for (const w of g.state.works) {
    const cat = g.catOf(w);
    if (!cat || skillMatch(g, cat, w)) continue;
    const donor = g.state.cats.find(d => d !== cat && mainSkill(g, d).ability.subIndex === w.a && !skillMatch(g, d));
    if (donor && swap(g, cat, donor)) n++;
  }
  return n;
}

// ---- gifts (CatGift.json; set_unitgift) ----
// A gift bubble (bt_unitGift) comes every GIFT_SECONDS; the window shows GIFT_BOXES boxes, one opens free, the ad button
// opens the rest. Rows: probability > 0, not limited, no season (limited / event rows are season items, left out).
export const giftRows = g => g.t.CatGift.filter(r => r.probability > 0 && !r.isLimited && !r.season);

export function rollGift(g) {
  const rows = giftRows(g);
  let r = g.rng() * rows.reduce((s, x) => s + x.probability, 0);
  for (const x of rows) { r -= x.probability; if (r < 0) return x; }
  return rows[rows.length - 1];
}

// Average energy per second of the rest facilities (the energy twin of Game.averageIncome).
export function averageEnergy(g) {
  let sum = B.ZERO;
  for (const w of g.state.works) {
    const a = g.work.get(w.a);
    if (a.type === 3) sum = B.add(sum, B.div(E.energyAmount(a, w.lv), E.REST_TICK));
  }
  return sum;
}

// GetReward_Inner: 101 = avgGold x value seconds, 102 = avgEnergy x value seconds, 3 gems, 4 furniture coins; types no
// feature grants yet (tickets, pudding, macaron) wait in stash.
export function payGift(g, row) {
  const v = row.rewardValue;
  let out;
  if (row.rewardType === 101) out = g.reward(1, B.mul(g.averageIncome(), v));
  else if (row.rewardType === 102) out = g.reward(2, B.mul(averageEnergy(g), v));
  else out = g.reward(row.rewardType, v);
  if (!out) { const s = ext(g).stash; s[row.rewardType] = (s[row.rewardType] || 0) + v; out = { type: row.rewardType, value: v, stashed: true }; }
  return out;
}

export const giftReady = g => !!ext(g).gift.ready;

// Opens the pending gift: returns the box rows (rolled once, kept until the window closes after a pick).
export function openGift(g) {
  const gift = ext(g).gift;
  if (!gift.ready) return null;
  if (!gift.boxes) gift.boxes = Array.from({ length: GIFT_BOXES }, () => ({ row: rollGift(g).index, got: false }));
  return gift.boxes;
}

// Free pick of one box; the rest wait for the ad button (claimRest). Returns the paid reward.
export function pickBox(g, i) {
  const gift = ext(g).gift;
  const box = gift.ready && gift.boxes && gift.boxes[i];
  if (!box || box.got || gift.boxes.some(b => b.got)) return null;
  box.got = true;
  const out = payGift(g, g.t.CatGift[box.row]);
  g.emit('catGift', { row: box.row, reward: out });
  return out;
}

// Ad button: opens every remaining box at once (an ad button stays and pays at once, FEATURES.md).
export function claimRest(g) {
  const gift = ext(g).gift;
  if (!gift.ready || !gift.boxes || !gift.boxes.some(b => b.got)) return [];
  const outs = [];
  for (const b of gift.boxes) if (!b.got) { b.got = true; outs.push(payGift(g, g.t.CatGift[b.row])); }
  return outs;
}

// Closing the window after a pick ends this gift and starts the next wait.
export function closeGift(g) {
  const gift = ext(g).gift;
  if (gift.boxes && gift.boxes.some(b => b.got)) { gift.ready = false; gift.boxes = null; gift.t = 0; return true; }
  return false;
}

// ---- feature contract ----
function initSlice(g) {
  const s = g.state;
  if (!s.cats_ext) s.cats_ext = { byId: {}, gift: { t: 0, ready: false, boxes: null }, stash: {} };
  return s.cats_ext;
}

export default {
  id: 'cats',
  data: [],
  init(g) {
    initSlice(g);
    for (const c of g.state.cats) ensureCat(g, c);
    for (const id of Object.keys(ext(g).byId)) if (!g.state.cats.some(c => c.id === +id)) delete ext(g).byId[id];
  },
  tick(g, dt) {
    const gift = ext(g).gift;
    if (!gift.ready && (gift.t += dt) >= GIFT_SECONDS) gift.ready = true;
  },
  offline(g, sec) {
    const gift = ext(g).gift;
    if (!gift.ready && (gift.t += sec) >= GIFT_SECONDS) gift.ready = true;
  },
  onEvent(g, e) {
    if (e.type === 'cat') ensureCat(g, e.cat);
    else if (e.type === 'fishHeart') addHeart(g, e.cat, e.value);
  },
  heartInfo, heartLevel, heartRow, heartBonus, addHeart,
  ability, abilityValue, rollSkillLevel, mainSkill, subSkill, skillMatch, skillFactor, subSkillPercent,
  swap, moveTo, bestFit,
  giftRows, rollGift, averageEnergy, payGift, giftReady, openGift, pickBox, claimRest, closeGift,
  ensureCat,
};
