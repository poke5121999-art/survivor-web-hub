// Cards, boosters, black market and resource boosting of the original (CardsService, BoostersService, BlackMarketService,
// ResourceBoostingService), on the save; no DOM. Data: data/cards.json (tools/build_cards.py). main.js loads this module
// with the home screen, or at start when the save already holds a card, never for a fresh first level. The views are in
// js/cardsui.js. Asm addresses: D:/stickman-hook-ref/dump/asm/{cards,blackmarket,boost,cardfx}/.
import { qty, addQty } from './meta.js';

const F = Math.fround;
const VALUE_K = F(1 / 8388607);
export const PERK = 'progression.cards_perk_level';
const WELCOME = 'flag.has_welcome_booster';
const SKIN_COINS = 'currency.skin_coins';

// UnityEngine.Random (libunity Xorshift128), the same port as advrun.js URandom.
export class URandom {
  constructor(seed = 0) { this.s = new Uint32Array(4); this.init(seed); }
  init(seed) {
    const s = this.s;
    s[0] = seed;
    s[1] = Math.imul(s[0], 1812433253) + 1;
    s[2] = Math.imul(s[1], 1812433253) + 1;
    s[3] = Math.imul(s[2], 1812433253) + 1;
  }
  next() {
    const s = this.s, t = (s[0] ^ (s[0] << 11)) >>> 0;
    s[0] = s[1]; s[1] = s[2]; s[2] = s[3];
    s[3] = s[3] ^ (s[3] >>> 19) ^ t ^ (t >>> 8);
    return s[3];
  }
  value() { return F((this.next() & 0x7fffff) * VALUE_K); }
  rangeInt(min, max) {
    if (min < max) return min + (this.next() % (max - min));
    if (min > max) return min - (this.next() % (min - max));
    return min;
  }
}

// XXHash64 (seed 0) of a string's UTF-8 bytes: the booster instance seed is (int)XXHash64(token) [asm 0x1275e04].
const M64 = (1n << 64n) - 1n, P1 = 11400714785074694791n, P2 = 14029467366897019727n, P3 = 1609587929392839161n,
  P4 = 9650029242287828579n, P5 = 2870177450012600261n;
const rotl = (x, r) => ((x << BigInt(r)) | (x >> BigInt(64 - r))) & M64;
const rnd64 = (acc, v) => (rotl((acc + v * P2) & M64, 31) * P1) & M64;
const merge = (acc, v) => (((acc ^ rnd64(0n, v)) * P1 + P4) & M64);
export function xxh64(str) {
  const b = new TextEncoder().encode(str), n = b.length, dv = new DataView(b.buffer);
  const u64 = (i) => dv.getBigUint64(i, true);
  let i = 0, h;
  if (n >= 32) {
    let v1 = (P1 + P2) & M64, v2 = P2, v3 = 0n, v4 = (M64 + 1n - P1) & M64;
    for (; i + 32 <= n; i += 32) { v1 = rnd64(v1, u64(i)); v2 = rnd64(v2, u64(i + 8)); v3 = rnd64(v3, u64(i + 16)); v4 = rnd64(v4, u64(i + 24)); }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) & M64;
    h = merge(merge(merge(merge(h, v1), v2), v3), v4);
  } else h = P5;
  h = (h + BigInt(n)) & M64;
  for (; i + 8 <= n; i += 8) h = ((rotl(h ^ rnd64(0n, u64(i)), 27) * P1) + P4) & M64;
  if (i + 4 <= n) { h = ((rotl(h ^ ((BigInt(dv.getUint32(i, true)) * P1) & M64), 23) * P2) + P3) & M64; i += 4; }
  for (; i < n; i++) h = (rotl(h ^ ((BigInt(b[i]) * P5) & M64), 11) * P1) & M64;
  h ^= h >> 33n; h = (h * P2) & M64; h ^= h >> 29n; h = (h * P3) & M64; h ^= h >> 32n;
  return h;
}
const int32 = (h) => Number(BigInt.asIntN(32, h));

// System.Math.Round (half to even)
export function roundEven(v) { const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }
// A GUID "N" (32 hex digits): the token of a booster instance id "<boosterId>_<token>" (BoosterIncentiveController).
export const guid = (rand = Math.random) => Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16)).join('');
// Local day id yyyy-MM-dd (OnlineDateService.Now is local time; FormatDateId) for consumption_ / daily flag keys.
export function dateId(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FIELDS = ['id', 'cat', 'rarity', 'name', 'desc', 'fmt', 'maxLevel', 'req', 'sprite', 'min', 'max', 'step'];
const SECOND_CHANCE = { 'mode.normal': 'card.second_chance_normal', 'mode.challenge': 'card.second_chance_challenge',
  'mode.grapple': 'card.second_chance_grapple', 'mode.tournament': 'card.second_chance_tournament' };
// AdventureSkillDto.bonusLevelCardId
export const SKILL_CARD = { bounce_difficulty: 'card.bounce_difficulty_limit_boost', wind_difficulty: 'card.wind_difficulty_limit_boost',
  hook_difficulty: 'card.hook_difficulty_limit_boost', rope_length: 'card.rope_length_limit_boost',
  teleporter_spawn_chance: 'card.teleporter_spawn_limit_boost', firewall_difficulty: 'card.fire_wall_limit_boost' };
const SIX_H = 6 * 3600 * 1000;

export class Cards {
  // `m` is the Meta: its reward table delivers boosters to this module, its roads gain the card perk road.
  constructor(d, m) {
    this.d = d; this.m = m;
    this.list = d.cards.map((a) => Object.fromEntries(FIELDS.map((f, i) => [f, a[i]])));
    this.byId = new Map(this.list.map((c) => [c.id, c]));
    this.cats = d.cats.map(([id, name, mode, pattern]) => ({ id, name, mode, pattern }));
    this.boosters = d.boosters;
    m.d.roads[PERK] = d.perk;
    this.perkMaxAll = this.list.reduce((t, c) => t + c.maxLevel, 0); // GetMaxPerkLevel: sum of cardMaxLevel (330)
    this.boostBy = new Map(d.boost.map(([card, res, src, cap]) => [`${res}_${src}`.toLowerCase(), { card, cap }]));
  }

  cat(id) { return this.cats.find((c) => c.id === id); }

  // ---- levels (CardsService) ----
  // Quantity under the card id itself [asm 0x1277100]; level = n < 1 ? 0 : (n - 1) / req + 1 [asm 0x127bb7c..0x127bba0]
  count(s, id) { return qty(s, id); }
  level(s, id, n = qty(s, id)) { const c = this.byId.get(id); return n < 1 ? 0 : Math.floor((n - 1) / c.req) + 1; }
  maxCards(id) { const c = this.byId.get(id); return (c.maxLevel - 1) * c.req + 1; } // CardDto.GetMaxCards [asm 0x127bd40]
  isMax(s, id, n) { return this.level(s, id, n) >= this.byId.get(id).maxLevel; } // [asm 0x126c808]
  // Bar: XP = n < 1 ? 0 : n >= max ? req : (n - 1) % req [asm 0x127bc8c..0x127bd20]; max XP = level 0 ? 1 : req [asm 0x127be38]
  xp(s, id, n = qty(s, id)) { const c = this.byId.get(id); return n < 1 ? 0 : n >= this.maxCards(id) ? c.req : (n - 1) % c.req; }
  needXp(s, id, n = qty(s, id)) { return this.level(s, id, n) < 1 ? 1 : this.byId.get(id).req; }
  progress(s, id, n = qty(s, id)) {
    return { have: this.xp(s, id, n), need: this.needXp(s, id, n), max: this.isMax(s, id, n), locked: n < 1 };
  }
  // GetCardEffectForLevel [asm 0x127c5b0]: level < 1 -> 0, >= max -> maxEffect, else min + graduation * (level - 1)
  effectAt(id, lv) {
    const c = this.byId.get(id);
    if (!c || lv < 1) return 0;
    return lv >= c.maxLevel ? c.max : F(c.min + c.step * (lv - 1));
  }
  effect(s, id) { return this.effectAt(id, this.level(s, id)); }
  unlocked(s, id) { return this.level(s, id) > 0; }
  valueText(id, lv) { const e = this.effectAt(id, lv); return this.byId.get(id).fmt.replace('{0}', +e.toFixed(2)); }
  info(s, id) {
    const c = this.byId.get(id), lv = this.level(s, id);
    const next = lv >= c.maxLevel ? '' : ` · cấp sau: ${this.valueText(id, Math.max(1, lv + 1))}`;
    return `${c.name.replace(/\n/g, ' ')}: ${c.desc.replace(/\n/g, ' ')} (${lv ? this.valueText(id, lv) : 'chưa có'}${next})`;
  }
  hasCards(s) { return this.list.some((c) => qty(s, c.id) > 0); } // requirement has_cards

  // ---- perk level (RecomputeCurrentPerkLevel [asm 0x127b9c4]) and its road (CardsLevelProgressionRoadService:
  // ClaimAllRewards("progression.cards_perk_level") on every change [asm 0x127b20c]) ----
  perk(s) { return this.list.reduce((t, c) => t + this.level(s, c.id), 0); }
  perkMax() { return this.perkMaxAll; }
  perkOf(s, cat) { return this.list.filter((c) => c.cat === cat).reduce((t, c) => t + this.level(s, c.id), 0); }
  perkMaxOf(cat) { return this.list.filter((c) => c.cat === cat).reduce((t, c) => t + c.maxLevel, 0); }
  // AddCard: adds to the card id; the perk level is recomputed and its road claimed. Returns the road's grants.
  addCard(s, id, n, out = []) {
    if (n <= 0) return out;
    addQty(s, id, n);
    const p = this.perk(s);
    if (p !== qty(s, PERK)) { s.inv[PERK] = p; this.m.claim(s, PERK, p).forEach((g) => out.push(g)); }
    return out;
  }

  // ---- boosters (BoostersService) ----
  // A booster reward does not stay in the inventory: BoosterIncentiveController turns each unit into an instance
  // "<id>_<GUID N>" and queues a BoosterOpeningPopup [asm 0x1278a68..0x1278b18]. Here the queue is save.boosterQueue.
  queue(s, res, q, rand = Math.random) {
    s.boosterQueue ||= [];
    for (let i = 0; i < q; i++) s.boosterQueue.push(res + '_' + guid(rand));
  }
  // Lucky Wheel GetFallbackIfNoCardAvailable [asm 0x1277260]: a booster whose rarities are all maxed becomes the first
  // weighted rarity's compensation x quantity.
  fallback(s, res, q) {
    const b = this.boosters[res];
    if (!b) return [res, q];
    const rs = b[8].filter(([, w]) => w > 0);
    if (rs.some(([r]) => this.list.some((c) => c.rarity === r && !this.isMax(s, c.id)))) return [res, q];
    return [SKIN_COINS, q * this.d.boosterRarity[rs[0][0]][1]];
  }

  // GetBoosterContent [asm 0x12759ec]. `inst` = "<boosterId>_<token>" (also one_more_card_ / extra_card_ prefixes).
  // Seeded part: UnityEngine.Random.InitState((int)XXHash64(token)) [asm 0x1275e04]. The rarity of a non-guaranteed
  // draw comes from an unseeded System.Random (WeightedRandom [asm 0x12763bc]): `rand` (Math.random by default).
  // Returns {id, extra, items: [{card, qty, isNew, doubled, rarity} | {coins, rarity}], rng} (rng continues the stream).
  content(s, inst, rand = Math.random) {
    const cut = inst.lastIndexOf('_'), token = inst.slice(cut + 1);
    let id = inst.slice(0, cut);
    const one = id.startsWith('one_more_card_') || id.startsWith('extra_card_'), extra = id.startsWith('extra_card_');
    id = id.replace(/^(one_more_card_|extra_card_)/, '');
    const b = this.boosters[id], [, , , nbCards, , , minS, maxS, weights, guaranteed] = b;
    const R = new URandom(int32(xxh64(token)));
    const drawn = new Map(), items = [];
    const have = (cid) => qty(s, cid) + (drawn.get(cid) || 0);
    const n = one ? 1 : nbCards; // [asm 0x1275d58]
    for (let i = 0; i < n; i++) {
      const shards = R.rangeInt(minS, maxS + 1); // inclusive [asm 0x1275e38]
      const g = guaranteed[i];
      let it;
      if (g && !g.startsWith('booster_card.')) it = this.specific(s, R, g, qty(s, g) < 1, shards, have);
      else {
        let rarity = g ? g.split('.')[1] : null;
        if (!rarity) {
          // WeightedRandom.GetRandom [asm 0x19749dc..0x1974c94]: target = sum * NextDouble(), first w > target
          const tot = weights.reduce((t, [, w]) => t + w, 0);
          let x = tot * Math.min(1, Math.max(0, rand()));
          rarity = weights[weights.length - 1][0];
          for (const [r, w] of weights) { if (x < w) { rarity = r; break; } x -= w; }
        }
        it = this.forRarity(s, R, rarity, shards, have, drawn);
      }
      if (it.card) drawn.set(it.card, (drawn.get(it.card) || 0) + it.qty);
      items.push(it);
    }
    return { id, inst, extra, one, items, rng: R };
  }

  // GenerateCardForRarity [asm 0x12766b0]: cards of the rarity not maxed (owned + drawn); none -> compensation coins;
  // all new / all owned -> no roll; else isNew = value < noveltyChance / 100; uniform pick among the matching cards.
  forRarity(s, R, rarity, shards, have) {
    const pool = this.list.filter((c) => c.rarity === rarity && this.level(s, c.id, have(c.id)) < c.maxLevel);
    const [novelty, comp] = this.d.boosterRarity[rarity];
    if (!pool.length) return { coins: comp, rarity };
    const isNewC = (c) => have(c.id) < 1;
    let isNew;
    if (pool.every(isNewC)) isNew = true;
    else if (!pool.some(isNewC)) isNew = false;
    else isNew = R.value() < novelty / 100; // [asm 0x1276940..0x127696c]
    const pick = pool.filter((c) => isNewC(c) === isNew);
    const c = pick[R.rangeInt(0, pick.length)]; // [asm 0x12769d0]
    return this.specific(s, R, c.id, isNew, shards, have);
  }

  // GenerateSpecificCard [asm 0x1276dc4]: a new card gives 1; an owned one min(shards, cards left to max), shards
  // doubled first by card.double_cards: Range(0, 1000) < (int)(effect * 10) while left > shards [asm 0x1276f80..0x1277018].
  specific(s, R, id, isNew, shards, have) {
    const c = this.byId.get(id);
    if (isNew) return { card: id, qty: 1, isNew: true, doubled: false, rarity: c.rarity };
    const left = this.maxCards(id) - have(id);
    let doubled = false;
    if (this.unlocked(s, 'card.double_cards') && left > shards
      && R.rangeInt(0, 1000) < Math.trunc(this.effect(s, 'card.double_cards') * 10)) { shards <<= 1; doubled = true; }
    return { card: id, qty: Math.max(0, Math.min(shards, left)), isNew: false, doubled, rarity: c.rarity };
  }

  // ConsumeBooster [asm 0x1276434]: each item into the inventory, the instance removed. The popup shows the same
  // content it grants (the original generates twice and its unseeded rarity roll can differ: not copied).
  consume(s, box) {
    const out = [];
    s.boosterQueue = (s.boosterQueue || []).filter((x) => x !== box.inst);
    for (const it of box.items) {
      it.before = qty(s, it.card);
      if (it.card) this.addCard(s, it.card, it.qty, out);
      else s.coins += it.coins;
    }
    return out;
  }
  // When the popup closes, card.extra_draw: >= 2 cards and Range(0, 1000) < (int)(effect * 10) on the booster's stream
  // grants extra_card_<id>, a one-draw booster opened next [asm 0x1142d6c..0x1142ec8].
  extraDraw(s, box) {
    if (box.items.length < 2 || !this.unlocked(s, 'card.extra_draw')) return false;
    if (box.rng.rangeInt(0, 1000) >= Math.trunc(this.effect(s, 'card.extra_draw') * 10)) return false;
    s.boosterQueue = ['extra_card_' + box.id + '_' + guid(), ...(s.boosterQueue || [])];
    return true;
  }
  // "+1 Card" (OneMoreCard [asm 0x1143644]): offered when the booster is not a one-more draw, nbRewarded >= 1 and its
  // first item is a card; a rewarded ad (rewarded.one_more_card, js/ads.js watch).
  canOneMore(box) { return !box.one && this.boosters[box.id][4] >= 1 && !!box.items[0]?.card; }
  oneMore(s, box) {
    s.boosterQueue = ['one_more_card_' + box.id + '_' + guid(), ...(s.boosterQueue || [])];
  }

  // ---- resource boosting (ResourceBoostingService.GetBoostAmount [asm 0x117d920]) ----
  // Key (resource + "_" + source).ToLowerInvariant(); bonus = RoundHalfEven(effect / 100 x quantity) (float), for "+%"
  // and "x" cards alike; capped by the day's amount left; the day's counter (consumption_<card>_<yyyy-MM-dd>) grows by
  // the BASE quantity [asm 0x117dd74], and only when the cap is >= 1. Locked card or nothing left -> 0.
  boost(s, res, source, q, day = dateId()) {
    const b = this.boostBy.get(`${res}_${source}`.toLowerCase());
    if (!b || q <= 0 || !this.unlocked(s, b.card)) return 0;
    const key = `consumption_${b.card}_${day}`;
    const left = b.cap < 1 ? Infinity : b.cap - qty(s, key);
    if (left <= 0) return 0;
    const bonus = Math.min(roundEven(F(F(this.effect(s, b.card) / 100) * q)), left);
    if (bonus >= 1 && b.cap >= 1) {
      for (const k of Object.keys(s.inv)) if (k.startsWith(`consumption_${b.card}_`) && k !== key) delete s.inv[k];
      addQty(s, key, q);
    }
    return bonus;
  }

  // ---- gameplay cards ----
  // DeservesSecondChance [asm 0x1207054..0x1207238]: the current mode's card; Range(0, 100) (int) < effect. No per-stage cap.
  secondChance(s, modeId, rand = Math.random) {
    const id = SECOND_CHANCE[modeId];
    if (!id || !this.unlocked(s, id)) return false;
    return this.effect(s, id) > Math.floor(rand() * 100);
  }
  // LuckyWheelService.HasExtraLuckyWheel [asm 0x115e1c4..0x115e234]: after each claim, Range(0, 1000) < (int)(effect * 10)
  extraWheel(s, rand = Math.random) {
    const id = 'card.extra_lucky_wheel';
    return this.unlocked(s, id) && Math.floor(rand() * 1000) < Math.trunc(this.effect(s, id) * 10);
  }
  // SkipLevelService.GetNbSkippableLevelsPerDay [asm 0x124ea74..0x124ea90]: trunc(effect)
  skipsPerDay(s) { return Math.trunc(this.effect(s, 'card.skip_level')); }
  // AdventureSkillsController.GetSkillLevelCap [asm 0x1269bb8..0x1269be8]: maxLevel + trunc(effect at the current level)
  skillCapBonus(s, skillId) { const id = SKILL_CARD[skillId]; return id ? Math.trunc(this.effect(s, id)) : 0; }
  // LevelUpRandomSkill [asm 0x126a6b4..0x126a714]: a free level when Range(0, 1000) < trunc(effect) * 10
  freeSkillLevel(s, rand = Math.random) {
    const id = 'card.skill_upgrade_boost';
    return this.unlocked(s, id) && Math.floor(rand() * 1000) < Math.trunc(this.effect(s, id)) * 10;
  }
  // AdventureService.ReceiveWeeklyTokens / ClaimDailyTokens [asm 0x1267e40, 0x12682b0]: RoundHalfEven(effect) tokens
  weeklyTokens(s) { return this.unlocked(s, 'card.weekly_starting_tokens') ? roundEven(this.effect(s, 'card.weekly_starting_tokens')) : 0; }
  dailyTokens(s, day = dateId()) {
    const id = 'card.daily_login_tokens', flag = 'flag.adventure_daily_token_flag_' + day;
    if (!this.unlocked(s, id) || qty(s, flag) > 0) return 0;
    for (const k of Object.keys(s.inv)) if (k.startsWith('flag.adventure_daily_token_flag_')) delete s.inv[k];
    s.inv[flag] = 1;
    const n = roundEven(this.effect(s, id));
    addQty(s, 'currency.adventure_tokens', n);
    return n;
  }
  // PachinkoLevelSpawner.Initialize [asm 0x1212548..0x1212718]: extra stickman: one value() roll, then
  // Range(0, min(count - 1, 10)); x10: five value() rolls, then k x Range(0, count - 1). `value` / `rangeInt` = the board RNG.
  pachinkoRolls(s, list, value, rangeInt) {
    const out = { extra: null, bonus: [] };
    const pe = 'card.pachinko_extra_stickman', px = 'card.pachinko_x10_multiplier';
    if (this.unlocked(s, pe) && value() < this.effect(s, pe) / 100) {
      out.extra = list.splice(rangeInt(0, Math.min(list.length - 1, 10)), 1)[0];
    }
    let k = 0;
    for (let i = 0; i < 5; i++) if (this.unlocked(s, px) && value() < this.effect(s, px) / 100) k++;
    for (let i = 0; i < k && list.length > 1; i++) out.bonus.push(list.splice(rangeInt(0, list.length - 1), 1)[0]);
    return out;
  }
  // PachinkoPeg.OnCollisionEnter2D [asm 0x121b39c..0x121b4d0]: while not destroying, value() < effect / 100 resists
  resists(s, value) {
    const id = 'card.pachinko_bumper_resistance';
    return this.unlocked(s, id) && value() < this.effect(s, id) / 100;
  }
  // PachinkoService.GetBonusGamesLimit [asm 0x116f26c..0x116f2d8], rolled in ResetPachinkoState; nothing reads it.
  bonusGames(s, rand = Math.random) {
    const id = 'card.pachinko_lucky_drop_limit';
    return this.unlocked(s, id) && rand() < this.effect(s, id) / 100 ? 1 : 0;
  }

  // ---- black market (BlackMarketService) ----
  // Rotation of 6 h (BlackMarketDuration 21600000 ms [asm 0x126cb10]) on the local calendar from 1970-01-01 local
  // (requirement.black_market_cycle, isUtc false [asm 0x1270160]): it turns at 00:00, 06:00, 12:00, 18:00 local.
  cycleEnd(now = Date.now()) {
    const off = new Date(now).getTimezoneOffset() * 60000, local = now - off;
    return (Math.floor(local / SIX_H) + 1) * SIX_H + off;
  }
  // ResetBlackMarket [asm 0x12717f8..0x1271988]: 3 customization items, then 3 cards, without last rotation's picks
  // (retry allowing them when too few are left), uniform Fisher-Yates with an unseeded System.Random: `rand`.
  market(s, now = Date.now(), rand = Math.random, x = {}) {
    const end = this.cycleEnd(now);
    const st = s.blackMarket;
    if (st && st.end === end) return st;
    const prev = st || { items: [], cards: [] };
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    // excluded: the tournament prize pool, the Lucky Drop main prize (first main option not owned), owned items
    const ex = [...this.d.exclude.tournament, this.d.exclude.pachinkoMain.find((r) => !this.m.ownsRes(s, r)), ...(x.exclude || [])];
    const pickItems = (same) => Object.keys(this.d.market).filter((res) => this.d.market[res][0] === 'customization'
      && !ex.includes(res) && (same || !prev.items.includes(res)) && this.m.byId.has(res) && !this.m.ownsRes(s, res));
    let items = pickItems(false);
    if (items.length <= 2) items = pickItems(true); // [asm 0x1270b0c..0x1270be0]
    const pickCards = (same) => this.list.filter((c) => this.d.market[c.id] && (same || !prev.cards.includes(c.id))
      && this.level(s, c.id) >= 1 && !this.isMax(s, c.id)).map((c) => c.id);
    let cards = pickCards(false);
    if (cards.length < 3) cards = pickCards(true); // [asm 0x126c208..0x126c280]
    s.blackMarket = { end, items: shuffle(items).slice(0, 3), cards: shuffle(cards).slice(0, 3), bought: [] };
    s.blackMarket.offers = this.cardOffers(s);
    return s.blackMarket;
  }
  // RebuildMarketOffers b__1 [asm 0x126edc0..0x126f0f8]: quantity = XP left in the current level, price = unit x quantity
  cardOffers(s) {
    const o = {};
    for (const id of s.blackMarket.cards) {
      const q = this.needXp(s, id) - this.xp(s, id);
      o[id] = { qty: q, price: this.d.market[id][1] * q };
    }
    return o;
  }
  // One card offer per rotation (BlackMarketCardPurchaseRequirement [asm 0x11a2154]); a card received at max from any
  // source also counts as bought [asm 0x126c554..0x126c640]. Items: owned 0, flat price.
  buyCard(s, id) {
    const bm = s.blackMarket, o = bm?.offers[id];
    if (!o || bm.bought.includes(id) || this.isMax(s, id)) return { refused: 'sold' };
    if (s.coins < o.price) return { refused: 'coins', price: o.price };
    s.coins -= o.price;
    const got = this.addCard(s, id, o.qty);
    bm.bought.push(id);
    return { price: o.price, qty: o.qty, got };
  }
  buyItem(s, res) {
    const bm = s.blackMarket, price = this.d.market[res]?.[1];
    if (!bm?.items.includes(res) || this.m.ownsRes(s, res)) return { refused: 'sold' };
    if (s.coins < price) return { refused: 'coins', price };
    s.coins -= price;
    const got = [];
    this.m.grantReward(s, [res, 1], got);
    return { price, got };
  }
}

// `app` is main.js's handle. Hooks the rules into the meta (booster rewards, resource boosts) and returns them.
export function makeCards(app, d) {
  const c = new Cards(d, app.meta);
  app.meta.cards = c;
  return c;
}
export const welcomeFlag = WELCOME;
