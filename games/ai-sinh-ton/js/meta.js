// The player's account: its shape, its save and every command that changes it. Pure logic over the rule modules
// (no DOM), so tools/meta-test.mjs runs the same code as the browser.
//
// Account (version 1):
//   { v, gold, gems, pity, heroes: {id: {level, shards}}, team: [id x1..4], cleared, best: {stage: seconds},
//     bag: [{uid, item, tier, lv}], equip: {heroId: {slot: uid|0}}, mats: {slot: n}, uidSeq, seed,
//     daily: 'YYYY-MM-DD'|'', chapters: {c: true}, stats: {pulls, wins, losses}, seen: {key: true} }

import { GACHA, HERO_RARITY, rollGacha, rollTen, levelCost, levelMul, stageReward, lossReward, DAILY, START } from './data/economy.js';
import { SLOTS, TIERS, ITEMS, ITEM, itemStat, upgradeCost, mergeProblem, merge as mergeItems, autoMergePlan, equipBonus } from './data/equip.js';
import { HEROES, HERO } from './data/heroes.js';
import { makeRng } from './sim/battle.js';

const VERSION = 1;
const TEAM_MAX = 4;
const CHAPTER_STAGES = 5;
const CHAPTER_GEMS = 300;
const HIEM = 2;
const ROSTER = HEROES.map((h) => ({ id: h.id, rarity: h.rarity }));
const SLOT_IDS = SLOTS.map((s) => s.id);
const ITEMS_BY_SLOT = Object.fromEntries(SLOT_IDS.map((s) => [s, ITEMS.filter((i) => i.slot === s)]));

const num = (x, fallback, min = 0) => (Number.isFinite(x) ? Math.max(min, Math.floor(x)) : fallback);
const fail = (why) => ({ ok: false, why });
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
const emptyMats = () => Object.fromEntries(SLOT_IDS.map((s) => [s, 0]));
const emptySlots = () => Object.fromEntries(SLOT_IDS.map((s) => [s, 0]));

function freshAccount(now) {
  return {
    v: VERSION, gold: START.gold, gems: START.gems, pity: 0,
    heroes: Object.fromEntries(START.heroes.map((id) => [id, { level: 1, shards: 0 }])),
    team: START.heroes.slice(), cleared: 0, best: {}, bag: [], equip: {}, mats: emptyMats(), uidSeq: 0,
    seed: (now().getTime() ^ 0x9e3779b9) >>> 0 || 1, daily: '', chapters: {}, stats: { pulls: 0, wins: 0, losses: 0 }, seen: {},
  };
}

// Field-by-field repair of whatever came out of storage. Never throws; anything unreadable falls back to the new-account value.
function repair(raw, now) {
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
    for (const id of START.heroes) acc.heroes[id] = { level: 1, shards: acc.heroes[id] ? acc.heroes[id].shards : 0 };
  }
  const owned = (id) => acc.heroes[id] && acc.heroes[id].level > 0;
  const team = [];
  for (const id of Array.isArray(a.team) ? a.team : []) if (owned(id) && !team.includes(id) && team.length < TEAM_MAX) team.push(id);
  if (!team.length) for (const id of Object.keys(acc.heroes)) if (owned(id) && team.length < TEAM_MAX) team.push(id);
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
  acc.stats = { pulls: 0, wins: 0, losses: 0 };
  if (a.stats && typeof a.stats === 'object') for (const k of Object.keys(acc.stats)) acc.stats[k] = num(a.stats[k], 0);
  acc.seen = {};
  if (a.seen && typeof a.seen === 'object') for (const [k, v] of Object.entries(a.seen)) if (v) acc.seen[k] = true;
  return acc;
}

export function createMeta({ storage = globalThis.localStorage, now = () => new Date(), key = 'aisinhton.save.v1' } = {}) {
  const M = { acc: freshAccount(now), readOnly: false };
  const listeners = [];

  const owned = (id) => !!(M.acc.heroes[id] && M.acc.heroes[id].level > 0);
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
    if (raw && typeof raw === 'object' && Number.isFinite(raw.v) && raw.v > VERSION) { M.readOnly = true; M.acc = freshAccount(now); return M.acc; }
    M.acc = repair(raw, now);
    return M.acc;
  };
  M.reset = () => { M.readOnly = false; M.acc = freshAccount(now); M.save(); return M.acc; };
  M.on = (fn) => { listeners.push(fn); };

  // The account's rng: each command draws from the seed and stores the next one.
  const withRng = (fn) => {
    const rng = makeRng(M.acc.seed);
    const out = fn(rng);
    M.acc.seed = Math.floor(rng() * 4294967296) >>> 0 || 1;
    return out;
  };
  const done = (name, result) => { M.save(); const r = { ok: true, ...result }; for (const fn of listeners) fn(name, r); return r; };

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
  M.pull = (n = 1) => {
    if (n !== 1 && n !== 10) return fail('số lượt không hợp lệ');
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
        else if (o.kind === 'item') r.item = randomItem(rng, 0);
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
    M.acc.team = ids.slice();
    return done('setTeam', { team: M.acc.team.slice() });
  };

  // ---- stages and rewards
  M.finishStage = ({ stage, won, wavesCleared = 0, seconds = 0 }) => {
    if (!Number.isInteger(stage) || stage < 1) return fail('ải không hợp lệ');
    const acc = M.acc;
    const first = !!won && stage > acc.cleared;
    const r = won ? stageReward(stage, first) : lossReward(stage, wavesCleared);
    const items = [];
    withRng((rng) => {
      let slots = null;
      if (first) {
        const open = SLOT_IDS.filter((s) => acc.team.some((id) => !(acc.equip[id] && acc.equip[id][s])));
        if (open.length) slots = open;
      }
      for (let i = 0; i < r.items; i++) items.push(randomItem(rng, 0, slots));
      for (let i = 0; i < r.mats; i++) acc.mats[pick(rng, SLOT_IDS)]++;
    });
    acc.gold += r.gold; acc.gems += r.gems;
    for (const id of acc.team) addShards(id, r.teamShards);
    if (won) {
      acc.stats.wins++;
      acc.cleared = Math.max(acc.cleared, stage);
      if (Number.isFinite(seconds) && seconds > 0 && !(acc.best[stage] <= seconds)) acc.best[stage] = seconds;
    } else acc.stats.losses++;
    return done('finishStage', { won: !!won, first, stage, gold: r.gold, gems: r.gems, teamShards: r.teamShards, mats: r.mats, items });
  };
  M.canClaimDaily = () => M.acc.daily !== dayOf(now());
  M.claimDaily = () => {
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
    if (!Number.isInteger(c) || c < 0) return fail('chương không hợp lệ');
    if (M.acc.chapters[c]) return fail('chương này đã nhận rồi');
    if (M.acc.cleared < (c + 1) * CHAPTER_STAGES) return fail('chưa qua đủ ải của chương');
    M.acc.chapters[c] = true; M.acc.gems += CHAPTER_GEMS;
    const each = CHAPTER_STAGES * (c + 1);
    for (const s of SLOT_IDS) M.acc.mats[s] += each;
    let item;
    withRng((rng) => { item = randomItem(rng, HIEM); });
    return done('claimChapter', { chapter: c, gems: CHAPTER_GEMS, mats: each, item });
  };

  // ---- equipment
  M.equip = (hid, uid) => {
    if (!owned(hid)) return fail('chưa có tướng này');
    const it = findItem(uid);
    if (!it) return fail('không tìm thấy món đồ');
    const slot = ITEM[it.item].slot;
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
  M.canUpgradeItem = (uid) => {
    const it = findItem(uid);
    if (!it) return { ok: false, cost: null, why: 'không tìm thấy món đồ' };
    if (it.lv >= TIERS[it.tier].maxLv) return { ok: false, cost: null, why: 'đã đạt cấp tối đa' };
    const cost = upgradeCost(it.lv);
    if (M.acc.gold < cost.gold) return { ok: false, cost, why: 'thiếu vàng' };
    if (M.acc.mats[ITEM[it.item].slot] < cost.mats) return { ok: false, cost, why: 'thiếu bản rèn' };
    return { ok: true, cost, why: '' };
  };
  M.upgradeItem = (uid) => {
    const c = M.canUpgradeItem(uid);
    if (!c.ok) return fail(c.why);
    const it = findItem(uid);
    M.acc.gold -= c.cost.gold; M.acc.mats[ITEM[it.item].slot] -= c.cost.mats; it.lv++;
    return done('upgradeItem', { uid, lv: it.lv, cost: c.cost });
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
    const main = findItem(mainUid);
    if (!main) return fail('không tìm thấy món chính');
    const fodder = (Array.isArray(fodderUids) ? fodderUids : []).map(findItem);
    if (fodder.some((f) => !f)) return fail('không tìm thấy nguyên liệu');
    const worn = wornUids();
    if (fodder.some((f) => worn.has(f.uid))) return fail('nguyên liệu đang được mặc');
    const why = mergeProblem(main, fodder);
    if (why) return fail(why);
    const r = applyMerge(main, fodder);
    return done('merge', { uid: main.uid, tier: main.tier, refund: r.refund });
  };
  M.autoMerge = () => {
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

  // ---- red dots
  M.dots = () => {
    const acc = M.acc;
    const heroIds = {};
    let heroes = false;
    for (const id of Object.keys(acc.heroes)) if (owned(id) && M.canLevelUp(id).ok) { heroIds[id] = true; heroes = true; }
    const worn = wornUids();
    const free = acc.bag.filter((i) => !worn.has(i.uid));
    let equip = autoMergePlan(acc.bag, worn).length > 0;
    for (const id of acc.team) {
      const e = acc.equip[id] || {};
      for (const s of SLOT_IDS) {
        const cur = findItem(e[s]);
        const curStat = cur ? itemStat(cur) : 0;
        if (free.some((i) => ITEM[i.item].slot === s && itemStat(i) > curStat)) { equip = true; heroIds[id] = true; }
        if (cur && M.canUpgradeItem(cur.uid).ok) equip = true;
      }
    }
    let rewards = M.canClaimDaily();
    for (let c = 0; c * CHAPTER_STAGES < acc.cleared; c++) if (M.canClaimChapter(c)) rewards = true;
    return { gacha: acc.gems >= GACHA.cost, heroes, equip, rewards, heroIds };
  };

  M.load();
  return M;
}
