// The player's account: its shape, its save and every command that changes it. Pure logic over the rule modules
// (no DOM), so tools/meta-test.mjs runs the same code as the browser.
//
// Account (version 1):
//   { v, gold, gems, pity, heroes: {id: {level, shards}}, team: [id x1..4], cleared, best: {stage: seconds},
//     bag: [{uid, item, tier, lv}], equip: {heroId: {slot: uid|0}}, mats: {slot: n}, uidSeq, seed,
//     daily: 'YYYY-MM-DD'|'', chapters: {c: true}, stats: {pulls, wins, losses}, seen: {key: true},
//     level, xp (account level), ftue: {done: {stepId: true}, session}, seenUnlock: {id: true}, visited: {id: true},
//     freePull, cheatUnlock? (only the 'vet' preset: every unlock treated as open),
//     equipAt (stages cleared when Trang Bị opened), mergeOpen (latched once the bag held 3 identical items) }
// stats also counts upgrades and merges (manual) for the equipment unlocks.

import { GACHA, HERO_RARITY, rollGacha, rollTen, levelCost, levelMul, stageReward, lossReward, DAILY, START } from './data/economy.js?v=20261120f';
import { SLOTS, TIERS, ITEMS, ITEM, itemStat, upgradeCost, mergeProblem, merge as mergeItems, autoMergePlan, equipBonus, baseWorth } from './data/equip.js?v=20261120f';
import { HEROES, HERO } from './data/heroes.js?v=20261120f';
import { UNLOCKS, UNLOCK, isUnlocked, lockText, teamSlots, newUnlocks, addXp, xpForResult, NEW_ACCOUNT, GIFTS, FTUE, LATER_GUIDES, mergeTriples, wornOf, slotOpen, openSlots, slotLine, EQUIP_GOLD } from './data/unlocks.js?v=20261120f';
import { makeRng } from './sim/battle.js?v=20261120f';

const VERSION = 1;
const TEAM_MAX = 4;
const CHAPTER_STAGES = 5;
const CHAPTER_GEMS = 300;
const HIEM = 2;
const ROSTER = HEROES.map((h) => ({ id: h.id, rarity: h.rarity }));
const FTUE_IDS = FTUE.map((s) => s.id);
const GUIDE_IDS = [...FTUE_IDS, ...Object.keys(LATER_GUIDES)];
// the home tab that shows a red dot while a feature is open and not yet visited
const UNLOCK_TAB = { gacha: 'gacha', levelup: 'heroes', slot2: 'heroes', slot3: 'heroes', slot4: 'heroes', daily: 'rewards', chapter: 'rewards' };
// features that came with Trang Bị before it was staged: a save that already had it must not replay their reveals
const STAGED = ['upgrade', 'slot_armor', 'slot_hands', 'slot_charm', 'merge'];
const LEGACY_EQUIP_AT = -99;
const GIFT_ITEM = 'w_cua';
// the screen a later guide is shown on
const LATER_SCREEN = { spectate: 'battle', speed: 'battle', daily: 'home', chapter: 'home', equip: 'home', merge: 'home' };
const FIRST_PULL = GIFTS.find((g) => g.at === 'firstPull').hero;
const TUTORIAL_HERO = GIFTS.find((g) => g.at === 'tutorial').hero;
const SLOT_IDS = SLOTS.map((s) => s.id);
const ITEMS_BY_SLOT = Object.fromEntries(SLOT_IDS.map((s) => [s, ITEMS.filter((i) => i.slot === s)]));

const num = (x, fallback, min = 0) => (Number.isFinite(x) ? Math.max(min, Math.floor(x)) : fallback);
const fail = (why) => ({ ok: false, why });
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
const emptyMats = () => Object.fromEntries(SLOT_IDS.map((s) => [s, 0]));
const emptySlots = () => Object.fromEntries(SLOT_IDS.map((s) => [s, 0]));

const allTrue = (ids) => Object.fromEntries(ids.map((id) => [id, true]));
const openAtStart = () => UNLOCKS.filter((u) => !Object.keys(u.need).length).map((u) => u.id);

function freshAccount(now, preset) {
  const vet = preset === 'vet';
  const heroes = vet ? START.heroes : NEW_ACCOUNT.heroes;
  const acc = {
    v: VERSION, gold: vet ? START.gold : NEW_ACCOUNT.gold, gems: vet ? START.gems : NEW_ACCOUNT.gems, pity: 0,
    heroes: Object.fromEntries(heroes.map((id) => [id, { level: 1, shards: 0 }])),
    team: heroes.slice(), cleared: 0, best: {}, bag: [], equip: {}, mats: emptyMats(), uidSeq: 0,
    seed: (now().getTime() ^ 0x9e3779b9) >>> 0 || 1, mergeOpen: false, daily: '', chapters: {}, stats: { pulls: 0, wins: 0, losses: 0, upgrades: 0, merges: 0 }, seen: {},
    level: vet ? 10 : 1, xp: 0, ftue: { done: {}, session: false }, seenUnlock: allTrue(openAtStart()), visited: allTrue(openAtStart()), freePull: !vet,
  };
  if (vet) {
    acc.cheatUnlock = true; acc.equipAt = LEGACY_EQUIP_AT; acc.mergeOpen = true;
    acc.ftue = { done: allTrue(GUIDE_IDS), session: true };
    acc.seenUnlock = allTrue(UNLOCKS.map((u) => u.id)); acc.visited = allTrue(UNLOCKS.map((u) => u.id));
  }
  return acc;
}

const slotsFor = (acc) => (acc.cheatUnlock ? TEAM_MAX : teamSlots(acc));

// Field-by-field repair of whatever came out of storage. Never throws; anything unreadable falls back to the new-account value.
function repair(raw, now, preset) {
  if (!raw || typeof raw !== 'object') return freshAccount(now, preset);
  const base = freshAccount(now);
  const a = raw && typeof raw === 'object' ? raw : {};
  const acc = { ...base };
  acc.gold = num(a.gold, base.gold);
  acc.gems = num(a.gems, base.gems);
  acc.pity = Math.min(num(a.pity, 0), GACHA.pity - 1);
  acc.cleared = num(a.cleared, 0);
  acc.seed = num(a.seed, base.seed) || 1;
  acc.daily = typeof a.daily === 'string' ? a.daily : '';
  acc.heroes = {};
  if (a.heroes && typeof a.heroes === 'object') {
    for (const [id, h] of Object.entries(a.heroes)) {
      if (!HERO[id] || !h || typeof h !== 'object') continue;
      acc.heroes[id] = { level: num(h.level, 0), shards: num(h.shards, 0) };
    }
  }
  if (!Object.values(acc.heroes).some((h) => h.level > 0)) {
    for (const id of Object.keys(base.heroes)) acc.heroes[id] = { level: 1, shards: acc.heroes[id] ? acc.heroes[id].shards : 0 };
  }
  const owned = (id) => acc.heroes[id] && acc.heroes[id].level > 0;
  if (a.cheatUnlock === true || base.cheatUnlock) acc.cheatUnlock = true; else delete acc.cheatUnlock;
  // level and xp of a save from before accounts had them: as if each cleared stage was won once
  const fromStages = addXp(1, 0, acc.cleared * xpForResult({ won: true, wavesCleared: 5, first: true }));
  const lv = Number.isFinite(a.level) ? addXp(Math.max(1, Math.floor(a.level)), num(a.xp, 0), 0) : fromStages;
  acc.level = lv.level; acc.xp = lv.xp;
  const team = [];
  for (const id of Array.isArray(a.team) ? a.team : []) if (owned(id) && !team.includes(id) && team.length < slotsFor(acc)) team.push(id);
  if (!team.length) for (const id of Object.keys(acc.heroes)) if (owned(id) && team.length < slotsFor(acc)) team.push(id);
  acc.team = team;
  acc.best = {};
  if (a.best && typeof a.best === 'object') for (const [k, s] of Object.entries(a.best)) if (Number.isFinite(+k) && Number.isFinite(s) && s >= 0) acc.best[k] = s;
  acc.bag = [];
  const seen = new Set();
  let top = 0;
  for (const it of Array.isArray(a.bag) ? a.bag : []) {
    if (!it || typeof it !== 'object' || !ITEM[it.item] || !TIERS[it.tier]) continue;
    const uid = num(it.uid, 0);
    if (uid < 1 || seen.has(uid)) continue;
    seen.add(uid); top = Math.max(top, uid);
    acc.bag.push({ uid, item: it.item, tier: it.tier, lv: Math.min(Math.max(num(it.lv, 1), 1), TIERS[it.tier].maxLv) });
  }
  acc.uidSeq = Math.max(num(a.uidSeq, 0), top);
  acc.equip = {};
  const worn = new Set();
  if (a.equip && typeof a.equip === 'object') {
    for (const [hid, slots] of Object.entries(a.equip)) {
      if (!owned(hid) || !slots || typeof slots !== 'object') continue;
      const out = emptySlots();
      for (const s of SLOT_IDS) {
        const it = acc.bag.find((i) => i.uid === slots[s]);
        if (it && ITEM[it.item].slot === s && !worn.has(it.uid)) { out[s] = it.uid; worn.add(it.uid); }
      }
      acc.equip[hid] = out;
    }
  }
  acc.mats = emptyMats();
  if (a.mats && typeof a.mats === 'object') for (const s of SLOT_IDS) acc.mats[s] = num(a.mats[s], 0);
  acc.chapters = {};
  if (a.chapters && typeof a.chapters === 'object') for (const [k, v] of Object.entries(a.chapters)) if (v && Number.isFinite(+k)) acc.chapters[k] = true;
  acc.stats = { pulls: 0, wins: 0, losses: 0, upgrades: 0, merges: 0 };
  if (a.stats && typeof a.stats === 'object') for (const k of Object.keys(acc.stats)) acc.stats[k] = num(a.stats[k], 0);
  // a save from before Trang Bị was staged: everything it could already use stays open, no guide, no reveals
  const legacyEquip = isUnlocked(acc, 'equip') && !Number.isFinite(a.equipAt);
  if (Number.isFinite(a.equipAt)) acc.equipAt = Math.floor(a.equipAt); else if (legacyEquip) acc.equipAt = LEGACY_EQUIP_AT;
  if (legacyEquip && !(a.stats && Number.isFinite(a.stats.upgrades))) acc.stats.upgrades = 1;
  // only a save from before equipAt existed leaves mergeOpen unset on purpose: current saves write it (false until the latch fires)
  const preMerge = a.mergeOpen === undefined && !Number.isFinite(a.equipAt);
  if (isUnlocked(acc, 'equip') && (a.mergeOpen === true || (preMerge && acc.level >= 9) || mergeTriples(acc.bag, wornOf(acc)).length)) acc.mergeOpen = true;
  if (acc.mergeOpen && !(a.stats && Number.isFinite(a.stats.merges)) && preMerge) acc.stats.merges = 1;
  acc.seen = {};
  if (a.seen && typeof a.seen === 'object') for (const [k, v] of Object.entries(a.seen)) if (v) acc.seen[k] = true;
  const flags = (src, ids) => { const out = {}; if (src && typeof src === 'object') for (const id of ids) if (src[id]) out[id] = true; return out; };
  const open = UNLOCKS.filter((u) => acc.cheatUnlock || isUnlocked(acc, u.id)).map((u) => u.id);
  const ids = UNLOCKS.map((u) => u.id);
  const legacyOpen = legacyEquip ? STAGED.filter((id) => open.includes(id)) : [];
  if (a.ftue && typeof a.ftue === 'object') {
    acc.ftue = { done: flags(a.ftue.done, GUIDE_IDS), session: a.ftue.session === true };
    acc.seenUnlock = { ...base.seenUnlock, ...flags(a.seenUnlock, ids), ...allTrue(legacyOpen) }; acc.visited = { ...base.visited, ...flags(a.visited, ids) };
    if (legacyEquip) { acc.ftue.done.equip = true; if (acc.mergeOpen) acc.ftue.done.merge = true; }
    acc.freePull = typeof a.freePull === 'boolean' ? a.freePull : acc.cleared < 1;
  } else if (acc.cleared >= 1) {
    // a save from before the guided first session counts as a finished one
    acc.ftue = { done: allTrue(FTUE_IDS), session: true };
    for (const id of Object.keys(LATER_GUIDES)) if (open.includes(id)) acc.ftue.done[id] = true;
    acc.seenUnlock = allTrue(open); acc.visited = allTrue(open); acc.freePull = false;
  } else {
    acc.seenUnlock = { ...base.seenUnlock, ...flags(a.seenUnlock, ids) }; acc.visited = { ...base.visited, ...flags(a.visited, ids) };
    acc.freePull = typeof a.freePull === 'boolean' ? a.freePull : true;
  }
  return acc;
}

export function createMeta({ storage = globalThis.localStorage, now = () => new Date(), key = 'aisinhton.save.v1', preset } = {}) {
  const M = { acc: freshAccount(now, preset), readOnly: false };
  const listeners = [];

  const owned = (id) => !!(M.acc.heroes[id] && M.acc.heroes[id].level > 0);
  M.unlocked = (id) => { if (id === 'merge') latch(); return !!M.acc.cheatUnlock || isUnlocked(M.acc, id); };
  M.lockText = (id) => lockText(id, M.acc);
  M.slotOpen = (slot) => slotOpen(M.acc, slot);
  M.openSlots = () => openSlots(M.acc);
  M.slotLine = (slot) => slotLine(M.acc, slot);
  // GHÉP NHANH shows after the first manual merge
  M.autoShown = () => !!M.acc.cheatUnlock || M.acc.stats.merges >= 1;
  M.slots = () => slotsFor(M.acc);
  // the refusal of a command whose feature is still locked, or null
  const locked = (id) => (M.unlocked(id) ? null : fail(M.lockText(id)));
  const findItem = (uid) => M.acc.bag.find((i) => i.uid === uid);
  const wornUids = () => { const s = new Set(); for (const e of Object.values(M.acc.equip)) for (const u of Object.values(e)) if (u) s.add(u); return s; };
  const slotsOf = (hid) => (M.acc.equip[hid] || (M.acc.equip[hid] = emptySlots()));
  const wornBy = (uid) => { for (const [hid, e] of Object.entries(M.acc.equip)) for (const s of SLOT_IDS) if (e[s] === uid) return { hid, slot: s }; return null; };

  M.save = () => {
    if (M.readOnly || !storage) return false;
    try { storage.setItem(key, JSON.stringify(M.acc)); return true; } catch (e) { return false; }
  };
  M.load = () => {
    M.readOnly = false;
    let raw = null;
    try { const s = storage && storage.getItem(key); raw = s ? JSON.parse(s) : null; } catch (e) { raw = null; }
    if (raw && typeof raw === 'object' && Number.isFinite(raw.v) && raw.v > VERSION) { M.readOnly = true; M.acc = freshAccount(now, preset); return M.acc; }
    M.acc = repair(raw, now, preset);
    return M.acc;
  };
  M.reset = () => { M.readOnly = false; M.acc = freshAccount(now, preset); M.save(); return M.acc; };
  M.on = (fn) => { listeners.push(fn); };

  // The account's rng: each command draws from the seed and stores the next one.
  const withRng = (fn) => {
    const rng = makeRng(M.acc.seed);
    const out = fn(rng);
    M.acc.seed = Math.floor(rng() * 4294967296) >>> 0 || 1;
    return out;
  };
  // merge stays open once the bag has held three identical items, even after they are merged away
  const latch = () => { if (!M.acc.mergeOpen && isUnlocked(M.acc, 'equip') && mergeTriples(M.acc.bag, wornUids()).length) M.acc.mergeOpen = true; };
  const done = (name, result) => { latch(); M.save(); const r = { ok: true, ...result }; for (const fn of listeners) fn(name, r); return r; };

  const newItem = (item, tier = 0) => { const it = { uid: ++M.acc.uidSeq, item, tier, lv: 1 }; M.acc.bag.push(it); return it; };
  const randomItem = (rng, tier, slots) => newItem(pick(rng, slots ? slots.flatMap((s) => ITEMS_BY_SLOT[s]) : ITEMS).id, tier);

  function addShards(id, n) {
    const h = M.acc.heroes[id] || (M.acc.heroes[id] = { level: 0, shards: 0 });
    h.shards += n;
    const need = HERO_RARITY[HERO[id].rarity].craft;
    if (h.level === 0 && h.shards >= need) { h.shards -= need; h.level = 1; return true; }
    return false;
  }

  // ---- gacha
  function freePull() {
    const h = HERO[FIRST_PULL];
    const isNew = !owned(FIRST_PULL);
    const r = { row: 'hero_free', kind: 'hero', rarity: h.rarity, hero: FIRST_PULL, n: 0, isNew, dupe: !isNew, item: null };
    if (isNew) M.acc.heroes[FIRST_PULL] = { level: 1, shards: M.acc.heroes[FIRST_PULL] ? M.acc.heroes[FIRST_PULL].shards : 0 };
    else { r.kind = 'shard'; r.n = HERO_RARITY[h.rarity].dupe; addShards(FIRST_PULL, r.n); }
    M.acc.freePull = false; M.acc.stats.pulls += 1;
    return done('pull', { results: [r], free: true });
  }
  M.pull = (n = 1) => {
    const lock = locked('gacha'); if (lock) return lock;
    if (n !== 1 && n !== 10) return fail('số lượt không hợp lệ');
    if (M.acc.freePull) {
      if (n === 10) return fail('dùng lượt miễn phí đầu tiên trước');
      return freePull();
    }
    const cost = n === 10 ? GACHA.cost10 : GACHA.cost;
    if (M.acc.gems < cost) return fail('thiếu ngọc');
    M.acc.gems -= cost;
    const results = [];
    withRng((rng) => {
      // rollGacha treats any listed hero as owned, so it sees only heroes that really are
      const view = { pity: M.acc.pity, heroes: {} };
      const sync = () => { view.pity = M.acc.pity; view.heroes = {}; for (const id of Object.keys(M.acc.heroes)) if (owned(id)) view.heroes[id] = true; };
      sync();
      const apply = (o) => {
        const r = { row: o.row, kind: o.kind, rarity: o.rarity, hero: o.hero, n: o.n, isNew: o.isNew, dupe: !!o.dupe, item: null };
        M.acc.pity = o.row === 'hero_ssr' ? 0 : M.acc.pity + 1;
        if (o.kind === 'hero' && o.isNew) {
          const h = M.acc.heroes[o.hero] || (M.acc.heroes[o.hero] = { level: 0, shards: 0 });
          h.level = 1;
        } else if (o.kind === 'shard') {
          if (addShards(o.hero, o.n)) r.isNew = true;
        } else if (o.kind === 'gold') M.acc.gold += o.n;
        else if (o.kind === 'item') {
          // no equipment before Trang Bị: the row pays gold and says so
          if (M.unlocked('equip')) r.item = randomItem(rng, 0, M.openSlots());
          else { r.kind = 'gold'; r.n = EQUIP_GOLD.pullItem; M.acc.gold += r.n; }
        }
        results.push(r);
        sync();
      };
      if (n === 10) rollTen(view, ROSTER, rng, apply);
      else apply(rollGacha(view, ROSTER, rng, false));
    });
    M.acc.stats.pulls += n;
    return done('pull', { results });
  };

  // ---- heroes
  M.canLevelUp = (id) => {
    if (!owned(id)) return { ok: false, cost: null, why: 'chưa có tướng này' };
    const h = M.acc.heroes[id];
    const cost = levelCost(h.level);
    if (h.shards < cost.shards) return { ok: false, cost, why: 'thiếu mảnh' };
    if (M.acc.gold < cost.gold) return { ok: false, cost, why: 'thiếu vàng' };
    return { ok: true, cost, why: '' };
  };
  M.levelUp = (id) => {
    const lock = locked('levelup'); if (lock) return lock;
    const c = M.canLevelUp(id);
    if (!c.ok) return fail(c.why);
    const h = M.acc.heroes[id];
    h.shards -= c.cost.shards; M.acc.gold -= c.cost.gold; h.level++;
    return done('levelUp', { id, level: h.level, cost: c.cost });
  };
  M.setTeam = (ids) => {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > TEAM_MAX) return fail('đội hình cần 1 đến 4 tướng');
    if (new Set(ids).size !== ids.length) return fail('đội hình có tướng trùng');
    if (!ids.every(owned)) return fail('đội hình có tướng chưa sở hữu');
    if (ids.length > M.slots()) return fail(ids.length > 1 ? lockText(['slot2', 'slot3', 'slot4'][ids.length - 2]) : 'đội hình cần 1 đến 4 tướng');
    M.acc.team = ids.slice();
    return done('setTeam', { team: M.acc.team.slice() });
  };

  // ---- stages and rewards
  M.finishStage = ({ stage, won, wavesCleared = 0, seconds = 0 }) => {
    if (!Number.isInteger(stage) || stage < 1) return fail('ải không hợp lệ');
    const acc = M.acc;
    const first = !!won && stage > acc.cleared;
    const before = { level: acc.level, cleared: acc.cleared, equipAt: acc.equipAt, mergeOpen: acc.mergeOpen, stats: { upgrades: acc.stats.upgrades }, bag: acc.bag.map((i) => ({ ...i })), cheatUnlock: acc.cheatUnlock };
    const r = won ? stageReward(stage, first) : lossReward(stage, wavesCleared);
    const items = [];
    // equipment and forge materials are paid as gold until their feature is open; items only fall for opened slots
    const slotsNow = M.unlocked('equip') ? M.openSlots() : [];
    const matsNow = M.unlocked('equip') && M.unlocked('upgrade');
    let paidGold = 0; let mats = 0;
    withRng((rng) => {
      let slots = slotsNow;
      if (first) {
        const open = slotsNow.filter((s) => acc.team.some((id) => !(acc.equip[id] && acc.equip[id][s])));
        if (open.length) slots = open;
      }
      if (slotsNow.length) for (let i = 0; i < r.items; i++) items.push(randomItem(rng, 0, slots)); else paidGold += r.items * EQUIP_GOLD.item;
      if (matsNow) { for (let i = 0; i < r.mats; i++) acc.mats[pick(rng, slotsNow)]++; mats = r.mats; } else paidGold += r.mats * EQUIP_GOLD.mat;
    });
    acc.gold += r.gold + paidGold; acc.gems += r.gems;
    for (const id of acc.team) addShards(id, r.teamShards);
    const xp = xpForResult({ won: !!won, wavesCleared: Math.max(0, wavesCleared), first });
    Object.assign(acc, addXp(acc.level, acc.xp, xp));
    const gifts = [];
    const give = (id) => { if (!owned(id)) { acc.heroes[id] = { level: 1, shards: acc.heroes[id] ? acc.heroes[id].shards : 0 }; gifts.push(id); } };
    if (first) {
      for (const g of GIFTS) {
        const crossed = typeof g.at === 'object' && before.cleared < g.at.stage && stage >= g.at.stage;
        if (crossed || (g.at === 'tutorial' && before.cleared < 1 && stage >= 1)) give(g.hero);
      }
    }
    if (won) {
      acc.stats.wins++;
      acc.cleared = Math.max(acc.cleared, stage);
      if (Number.isFinite(seconds) && seconds > 0 && !(acc.best[stage] <= seconds)) acc.best[stage] = seconds;
    } else acc.stats.losses++;
    // Trang Bị opens: remember where, and hand over exactly one weapon
    let gift = null;
    if (!before.cheatUnlock && !isUnlocked(before, 'equip') && isUnlocked(acc, 'equip')) {
      acc.equipAt = acc.cleared;
      if (!acc.bag.some((i) => ITEM[i.item].slot === 'weapon')) { gift = newItem(GIFT_ITEM, 0); items.push(gift); }
    }
    latch();
    const unlocked = newUnlocks(before, acc);
    return done('finishStage', { won: !!won, first, stage, gold: r.gold + paidGold, itemGold: paidGold, gems: r.gems, teamShards: r.teamShards, mats, items, gift, xp, levelBefore: before.level, levelAfter: acc.level, unlocked, gifts });
  };
  M.canClaimDaily = () => M.acc.daily !== dayOf(now());
  M.claimDaily = () => {
    const lock = locked('daily'); if (lock) return lock;
    const today = dayOf(now());
    if (M.acc.daily === today) return fail('hôm nay đã nhận rồi');
    M.acc.daily = today; M.acc.gems += DAILY.gems; M.acc.gold += DAILY.gold;
    let hero = null;
    withRng((rng) => { hero = pick(rng, M.acc.team); });
    addShards(hero, DAILY.shards);
    return done('claimDaily', { gems: DAILY.gems, gold: DAILY.gold, shards: DAILY.shards, hero });
  };
  M.canClaimChapter = (c) => Number.isInteger(c) && c >= 0 && !M.acc.chapters[c] && M.acc.cleared >= (c + 1) * CHAPTER_STAGES;
  M.claimChapter = (c) => {
    const lock = locked('chapter'); if (lock) return lock;
    if (!Number.isInteger(c) || c < 0) return fail('chương không hợp lệ');
    if (M.acc.chapters[c]) return fail('chương này đã nhận rồi');
    if (M.acc.cleared < (c + 1) * CHAPTER_STAGES) return fail('chưa qua đủ ải của chương');
    M.acc.chapters[c] = true; M.acc.gems += CHAPTER_GEMS;
    const each = CHAPTER_STAGES * (c + 1);
    let item = null; let gold = 0; let mats = each;
    if (M.unlocked('equip')) withRng((rng) => { item = randomItem(rng, HIEM, M.openSlots()); }); else gold += EQUIP_GOLD.item * baseWorth(HIEM);
    if (!(M.unlocked('equip') && M.unlocked('upgrade'))) { gold += each * SLOT_IDS.length * EQUIP_GOLD.mat; mats = 0; }
    M.acc.gold += gold;
    for (const sl of SLOT_IDS) M.acc.mats[sl] += mats;
    return done('claimChapter', { chapter: c, gems: CHAPTER_GEMS, mats, item, gold });
  };

  // ---- equipment
  M.equip = (hid, uid) => {
    const lock = locked('equip'); if (lock) return lock;
    if (!owned(hid)) return fail('chưa có tướng này');
    const it = findItem(uid);
    if (!it) return fail('không tìm thấy món đồ');
    const slot = ITEM[it.item].slot;
    if (!M.slotOpen(slot)) return fail(M.slotLine(slot));
    const from = wornBy(uid);
    if (from) M.acc.equip[from.hid][from.slot] = 0;
    slotsOf(hid)[slot] = uid;
    return done('equip', { hero: hid, slot, uid, from: from ? from.hid : null });
  };
  M.unequip = (hid, slot) => {
    if (!SLOT_IDS.includes(slot)) return fail('ô trang bị không hợp lệ');
    const e = M.acc.equip[hid];
    if (!e || !e[slot]) return fail('ô này đang trống');
    const uid = e[slot]; e[slot] = 0;
    return done('unequip', { hero: hid, slot, uid });
  };
  // what MẶC TỐT NHẤT would do for a hero: per opened slot the strongest item nobody else wears, if it beats the worn one
  M.equipBestPlan = (hid) => {
    const changes = [];
    if (!M.unlocked('equip') || !owned(hid)) return { changes, gain: { atk: 0, hp: 0 } };
    const worn = wornUids(), e = M.acc.equip[hid] || {};
    for (const slot of M.openSlots()) {
      const cur = findItem(e[slot]), curStat = cur ? itemStat(cur) : 0;
      let best = null;
      for (const it of M.acc.bag) if (ITEM[it.item].slot === slot && (!worn.has(it.uid)) && (!best || itemStat(it) > itemStat(best))) best = it;
      if (best && itemStat(best) > curStat) changes.push({ slot, uid: best.uid, replaces: cur ? cur.uid : 0, gain: itemStat(best) - curStat });
    }
    const gain = { atk: 0, hp: 0 };
    for (const c of changes) gain[SLOTS.find((x) => x.id === c.slot).stat] += c.gain;
    return { changes, gain };
  };
  M.equipBest = (hid) => {
    const lock = locked('equip'); if (lock) return lock;
    if (!owned(hid)) return fail('chưa có tướng này');
    const plan = M.equipBestPlan(hid);
    if (!plan.changes.length) return fail('không có món nào mạnh hơn');
    for (const c of plan.changes) slotsOf(hid)[c.slot] = c.uid;
    return done('equipBest', { hero: hid, changes: plan.changes, gain: plan.gain });
  };
  M.canUpgradeItem = (uid) => {
    const it = findItem(uid);
    if (!it) return { ok: false, cost: null, why: 'không tìm thấy món đồ' };
    if (it.lv >= TIERS[it.tier].maxLv) return { ok: false, cost: null, why: 'đã đạt cấp tối đa' };
    // the first upgrade of the account is free and teaches the button
    if (!M.unlocked('upgrade')) return { ok: true, cost: { gold: 0, mats: 0 }, free: true, why: '' };
    const cost = upgradeCost(it.lv);
    if (M.acc.gold < cost.gold) return { ok: false, cost, why: 'thiếu vàng' };
    if (M.acc.mats[ITEM[it.item].slot] < cost.mats) return { ok: false, cost, why: 'thiếu bản rèn' };
    return { ok: true, cost, why: '' };
  };
  M.upgradeItem = (uid) => {
    const lock = locked('equip'); if (lock) return lock;
    const c = M.canUpgradeItem(uid);
    if (!c.ok) return fail(c.why);
    const it = findItem(uid);
    M.acc.gold -= c.cost.gold; M.acc.mats[ITEM[it.item].slot] -= c.cost.mats; it.lv++; M.acc.stats.upgrades++;
    return done('upgradeItem', { uid, lv: it.lv, cost: c.cost, free: !!c.free });
  };
  function applyMerge(main, fodder) {
    const r = mergeItems(main, fodder);
    main.tier = r.item.tier;
    const gone = new Set(fodder.map((f) => f.uid));
    M.acc.bag = M.acc.bag.filter((i) => !gone.has(i.uid));
    M.acc.gold += r.refund.gold; M.acc.mats[r.slot] += r.refund.mats;
    return r;
  }
  M.merge = (mainUid, fodderUids) => {
    const lock = locked('merge'); if (lock) return lock;
    const main = findItem(mainUid);
    if (!main) return fail('không tìm thấy món chính');
    const fodder = (Array.isArray(fodderUids) ? fodderUids : []).map(findItem);
    if (fodder.some((f) => !f)) return fail('không tìm thấy nguyên liệu');
    const worn = wornUids();
    if (fodder.some((f) => worn.has(f.uid))) return fail('nguyên liệu đang được mặc');
    const why = mergeProblem(main, fodder);
    if (why) return fail(why);
    const r = applyMerge(main, fodder);
    M.acc.stats.merges++;
    return done('merge', { uid: main.uid, tier: main.tier, refund: r.refund });
  };
  M.autoMerge = () => {
    const lock = locked('merge'); if (lock) return lock;
    let merges = 0;
    for (;;) {
      const plan = autoMergePlan(M.acc.bag, wornUids());
      if (!plan.length) break;
      for (const p of plan) { applyMerge(findItem(p.main.uid), p.fodder.map((f) => findItem(f.uid))); merges++; }
    }
    if (!merges) return fail('không có bộ nào để ghép');
    return done('autoMerge', { merges });
  };

  // ---- numbers for the battle and the UI
  M.heroStats = (id) => {
    const def = HERO[id];
    const h = M.acc.heroes[id];
    if (!def || !h) return null;
    const e = M.acc.equip[id] || {};
    const bonus = equipBonus(SLOT_IDS.map((s) => findItem(e[s])));
    const mul = levelMul(Math.max(h.level, 1));
    return { level: h.level, mul, atk: Math.round(def.atk * mul + bonus.atk), hp: Math.round(def.hp * mul + bonus.hp), atkFlat: bonus.atk, hpFlat: bonus.hp, perks: bonus.perks };
  };
  M.teamSpec = () => M.acc.team.map((id) => { const s = M.heroStats(id); return { id, mul: s.mul, atkFlat: s.atkFlat, hpFlat: s.hpFlat, perks: s.perks }; });
  M.power = (id) => { const s = M.heroStats(id); return s ? Math.round(s.atk * 4 + s.hp / 2) : 0; };
  M.teamPower = () => M.acc.team.reduce((sum, id) => sum + M.power(id), 0);

  // ---- guided first session and reveals
  const guideDone = (id) => !!M.acc.ftue.done[id];
  const ftueOpen = (step) => {
    // home steps wait for the first clear and run in table order
    if (step.when !== 'home') return true;
    return M.acc.cleared >= 1 && FTUE.filter((s) => s.when === 'home' && !guideDone(s.id))[0] === step;
  };
  M.ftueDone = (id) => {
    if (!GUIDE_IDS.includes(id)) return fail('bước hướng dẫn không có');
    if (guideDone(id)) return { ok: true, already: true };
    M.acc.ftue.done[id] = true;
    if (FTUE_IDS.every(guideDone)) M.acc.ftue.session = true;
    return done('ftueDone', { id });
  };
  M.ftueSkip = () => {
    for (const id of FTUE_IDS) M.acc.ftue.done[id] = true;
    M.acc.ftue.session = true;
    return done('ftueSkip', {});
  };
  // context: { screen, event }. An event step matches its `when`; home steps match at home.
  M.ftueNext = (ctx = {}) => {
    if (!M.acc.ftue.session) {
      const step = FTUE.find((s) => !guideDone(s.id) && !(ctx.skip && ctx.skip.includes(s.id)) && (s.when === ctx.event || (s.when === 'home' && (ctx.event === 'home' || (ctx.event === undefined && ctx.screen === 'home')))) && ftueOpen(s));
      if (step) return { ...step };
      return null;
    }
    for (const [id, g] of Object.entries(LATER_GUIDES)) {
      if (id === 'merge' && M.acc.stats.merges > 0) continue;
      if (id === 'equip' && !firstOpenItem()) continue;
      if (id === 'merge' && !mergeTriples(M.acc.bag, wornUids()).length) continue;
      if (!guideDone(id) && !(ctx.skip && ctx.skip.includes(id)) && M.unlocked(id) && LATER_SCREEN[id] === ctx.screen) return { id, ...g, later: true };
    }
    return null;
  };
  // bag item ids the later guides point at: the gift, or the first triple (main piece and two copies, lowest uids first)
  // the first item of an opened slot (the gift on a normal account), lowest uid first
  const firstOpenItem = () => { const open = M.openSlots(); return M.acc.bag.slice().sort((x, y) => x.uid - y.uid).find((i) => open.includes(ITEM[i.item].slot)); };
  M.guideTokens = () => {
    const first = firstOpenItem(), out = { 'bag-first': first ? 'bag-' + first.uid : '' };
    const tri = mergeTriples(M.acc.bag, wornUids())[0];
    if (tri) { out['bag-main'] = 'bag-' + tri.main.uid; out['bag-copy1'] = 'bag-' + tri.copies[0].uid; out['bag-copy2'] = 'bag-' + tri.copies[1].uid; }
    return out;
  };
  M.markSeen = (id) => { if (!UNLOCK[id] || M.acc.seenUnlock[id]) return { ok: true }; M.acc.seenUnlock[id] = true; return done('markSeen', { id }); };
  M.markVisited = (id) => { if (!UNLOCK[id] || M.acc.visited[id]) return { ok: true }; M.acc.visited[id] = true; return done('markVisited', { id }); };
  M.pendingReveals = () => UNLOCKS.filter((u) => M.unlocked(u.id) && !M.acc.seenUnlock[u.id]).map((u) => u.id);
  // a home tab was opened: clears the dots of the features that live on it
  M.visitTab = (tab) => { let any = false; for (const [id, t] of Object.entries(UNLOCK_TAB)) if (t === tab && !M.acc.visited[id] && M.unlocked(id)) { M.acc.visited[id] = true; any = true; } if (any) done('visitTab', { tab }); };

  // ---- red dots
  M.dots = () => {
    const acc = M.acc;
    const heroIds = {};
    let heroes = false;
    if (M.unlocked('levelup')) for (const id of Object.keys(acc.heroes)) if (owned(id) && M.canLevelUp(id).ok) { heroIds[id] = true; heroes = true; }
    const worn = wornUids();
    const free = acc.bag.filter((i) => !worn.has(i.uid));
    // equipment dots only where there is something worth doing: a stronger free item for an opened slot, an item that can be
    // upgraded now, a merge that can be made. Team heroes only. A new item alone lights nothing.
    const why = { better: false, upgrade: false, merge: false }, slotDots = {}, best = {};
    if (M.unlocked('equip')) {
      why.merge = M.unlocked('merge') && autoMergePlan(acc.bag, worn).length > 0;
      for (const id of acc.team) {
        const e = acc.equip[id] || {}; slotDots[id] = {};
        for (const s of M.openSlots()) {
          const cur = findItem(e[s]);
          const curStat = cur ? itemStat(cur) : 0;
          if (free.some((i) => ITEM[i.item].slot === s && itemStat(i) > curStat)) { slotDots[id][s] = 'better'; best[id] = true; heroIds[id] = true; why.better = true; }
          else if (cur && M.canUpgradeItem(cur.uid).ok) { slotDots[id][s] = 'upgrade'; why.upgrade = true; }
        }
      }
    }
    const equip = why.better || why.upgrade || why.merge;
    let rewards = M.unlocked('daily') && M.canClaimDaily();
    if (M.unlocked('chapter')) for (let c = 0; c * CHAPTER_STAGES < acc.cleared; c++) if (M.canClaimChapter(c)) rewards = true;
    const out = { gacha: M.unlocked('gacha') && (acc.freePull || acc.gems >= GACHA.cost), heroes, equip, rewards, heroIds, equipWhy: why, slotDots, best, merge: why.merge };
    for (const [id, tab] of Object.entries(UNLOCK_TAB)) if (M.unlocked(id) && !acc.visited[id]) out[tab] = true;
    return out;
  };

  M.load();
  return M;
}
