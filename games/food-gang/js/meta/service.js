// MetaService core, port of FG.Meta Service/MetaService.cs. The other partial files of the C# class
// (Skins, League, Missions, Match, Fridge, Matchmaking, Shop) are mixed into the prototype below.
//
// Stateless: every operation takes the profile, the UTC time (Date) and a seeded MetaRng, mutates the
// profile and returns what happened. The caller saves the profile (ProfileJson.save) after each one.
import { MetaRng, MetaTime } from './rng.js';
import { RewardType, Currency, Rarity, Reward, reward, MetaErrors, IapKind, ShopGroup, PriceType } from './types.js';
import { Profile, newSkinProgress, createProfile } from './profile.js';
import {
  MetaResult, CurrencyChanged, SkinUnlocked, TokensAdded, BoxOpened, RewardGranted, DifficultyChanged,
  AchievementUnlocked, IapProduct,
} from './events.js';
import { skinsPart } from './skins.js';
import { leaguePart } from './league.js';
import { missionsPart } from './missions.js';
import { matchPart, starForRank } from './match.js';
import { fridgePart } from './fridge.js';
import { matchmakingPart, slotRemap, teamForSlot } from './matchmaking.js';
import { shopPart } from './shop.js';

const CurrencyOfReward = [Currency.Coins, Currency.Gems];

function buildStatTable() {
  return new Map([
    ['kills', p => p.stats.kills],
    ['deaths', p => p.stats.deaths],
    ['boxes', p => p.stats.boxesOpened],
    ['heroes', p => p.skins.length],
    ['gold', p => p.stats.goldCollected],
    ['trophies', p => p.trophies],
    ['missions', p => p.stats.missionsCompleted],
    ['wins', p => p.stats.wins],
    ['losses', p => p.stats.losses],
    ['battles', p => p.stats.battles],
    ['offers', p => p.stats.dailyOffersClaimed],
    ['jumps', p => p.stats.jumps],
    ['maxSkinLevel', p => Profile.maxSkinLevel(p)],
  ]);
}

function buildIapTable(db) {
  const t = new Map([
    ['pass', new IapProduct('pass', IapKind.Pass, db.rules.vipWeekDays)],
    ['passmonthly', new IapProduct('passmonthly', IapKind.Pass, db.rules.vipMonthDays)],
  ]);
  for (const k of db.leaguePacks) t.set(k.id, new IapProduct(k.id, IapKind.LeaguePack));
  for (const s of db.shop) {
    if (s.priceType !== PriceType.InApp) continue;
    t.set(s.id, new IapProduct(s.id, s.group === ShopGroup.DailyPaid ? IapKind.DailySpecial : IapKind.GemPack));
  }
  return t;
}

// ---- name rules (UserData.NormalizeName / IsNameAllowed)

const FOLD = (() => {
  const d = new Map(Object.entries({
    0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g',
    '!': 'i', $: 's', '@': 'a', '|': 'i', 'ø': 'o', 'ñ': 'n', 'ç': 'c', 'ß': 's', 'ğ': 'g', 'ı': 'i', 'ş': 's',
  }));
  const span = (from, to, target) => {
    for (let ch = from.charCodeAt(0); ch <= to.charCodeAt(0); ch++) d.set(String.fromCharCode(ch), target);
  };
  span('à', 'å', 'a'); span('è', 'ë', 'e'); span('ì', 'ï', 'i'); span('ò', 'ö', 'o'); span('ù', 'ü', 'u');
  return d;
})();

const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u;
const isLetterOrDigit = ch => LETTER_OR_DIGIT.test(ch);

/** char-by-char ToLowerInvariant: one-to-one mappings only, so İ (U+0130) stays as in .NET invariant casing. */
function lowerInvariant(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const l = ch.toLowerCase();
    out += l.length === 1 ? l : ch;
  }
  return out;
}

// char.IsWhiteSpace set (String.Trim), which differs from JS trim on U+0085 and U+FEFF
const CS_TRIM = /^[\t-\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+|[\t-\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+$/g;

export class MetaService {
  constructor(db) {
    if (!db) throw new Error('db is null');
    this.db = db;
    this._stats = buildStatTable();
    this._iap = buildIapTable(db);
  }

  get R() { return this.db.rules; }

  /** Per-operation context: one profile, one clock reading, one RNG, one result. */
  _begin(p, now, rng, res) {
    if (!p) throw new Error('profile is null');
    const t = MetaTime.seconds(now);
    return {
      p, now, t, res,
      rng: rng ?? new MetaRng(t),
      get vip() { return Profile.isVip(p, now); },
    };
  }

  // ---------------------------------------------------------------- profile

  /** UserData() constructor: BRO level 1, 0 Coins, 0 Gems, 0 trophies, stock 6, pity 10. */
  newProfile(utcNow, rng) {
    const t = MetaTime.seconds(utcNow);
    const p = createProfile();
    p.createdAt = t;
    p.name = this.defaultName(rng);
    p.lastLeagueChange = t;
    p.skinPity = this.R.skinPityStart;
    p.fridge.stock = this.R.maxRewardStock;
    p.fridge.lastRefillHour = MetaTime.hourStart(t);
    return p;
  }

  // ---------------------------------------------------------------- currencies

  _addCurrency(c, cur, delta) {
    const before = cur === Currency.Coins ? c.p.coins : c.p.gems;
    const after = Math.max(0, Math.min(this.R.currencyCap, before + delta));
    if (cur === Currency.Coins) {
      c.p.coins = after;
      if (delta > 0) c.p.stats.goldCollected += delta;
    } else c.p.gems = after;
    c.res.events.push(new CurrencyChanged(cur, after - before, after));
  }

  balance(p, cur) { return cur === Currency.Coins ? p.coins : p.gems; }

  /** Pays a price; false (and an info.notenough.* error) when the balance is short. */
  _pay(c, cur, price) {
    if (this.balance(c.p, cur) < price) {
      MetaResult.fail(c.res, cur === Currency.Coins ? MetaErrors.NotEnoughCoins : MetaErrors.NotEnoughGems);
      return false;
    }
    if (price > 0) this._addCurrency(c, cur, -price);
    return true;
  }

  // ---------------------------------------------------------------- skins and tokens

  /** Game.AddSkin: no-op when owned; adds level 1, marks it NEW. */
  _addSkin(c, id) {
    if (Profile.hasSkin(c.p, id) || this.db.findSkin(id) === null) return;
    c.p.newSkins.push(id);
    c.p.skins.push(newSkinProgress(id));
    c.res.events.push(new SkinUnlocked(id));
  }

  /** Game.AddToken: tokens for a skin the player does not own are lost. */
  _addToken(c, skinId, count) {
    const s = skinId < 1 ? null : Profile.skin(c.p, skinId);
    if (s === null) return false;
    s.tokens += count;
    c.res.events.push(new TokensAdded(skinId, count));
    return true;
  }

  /** SkinProgression.TokenAvailable: tokens still useful to reach max level. */
  tokenAvailable(s) {
    let sum = 0;
    const levels = this.db.skinLevels;
    for (let i = s.level - 1; i < levels.length; i++) if (i >= 0) sum += levels[i].token;
    return sum - s.tokens;
  }

  anyTokenAvailable(p) { return p.skins.some(s => this.tokenAvailable(s) > 0); }

  _unownedSkins(p, rarity) { return this.db.skins.filter(s => s.rarity === rarity && !Profile.hasSkin(p, s.id)); }

  /** RewardSystem.BoxAvailable: a fridge can still give a new Rare/Epic skin or useful tokens. */
  boxAvailable(p) {
    return this._unownedSkins(p, Rarity.Rare).length > 0 || this._unownedSkins(p, Rarity.Epic).length > 0 ||
      this.anyTokenAvailable(p);
  }

  // ---------------------------------------------------------------- rewards

  /** Grants a reward from outside the listed operations (events, cheats, tests). */
  grantReward(p, rew, source, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    this._grant(c, rew, source);
    return c.res;
  }

  /** Grants one reward through RandomRewards + GetRewards and returns the concrete rewards. */
  _grant(c, r, source) {
    const granted = [];
    if (r === null || r === undefined) return granted;
    if (Reward.isBox(r)) {
      // count 0 in data means one box ([CHƯA RÕ] §19.1 #3)
      const boxes = Math.max(1, r.count);
      for (let i = 0; i < boxes; i++) {
        const contents = this._rollBox(c, this.db.box(r.type));
        c.p.stats.boxesOpened++;
        c.res.events.push(new BoxOpened(r.type, contents));
        for (const x of contents) this._apply(c, x, RewardType.name(r.type), granted);
      }
    } else this._apply(c, this._expand(c, r), source, granted);
    this._checkAchievements(c);
    return granted;
  }

  /** RandomRewards for non-box rewards: random skin and unassigned tokens get a concrete target. */
  _expand(c, r) {
    if (r.type === RewardType.Skin && r.skinId <= 0) {
      const rarity = c.rng.rangeFloat(0, 100) < this.R.epicChance ? Rarity.Epic : Rarity.Rare;
      const skin = this._randomRewardSkin(c, rarity);
      return skin ?? reward(RewardType.Freemium, this.R.fallbackSkinCoins); // [ĐỀ XUẤT] §19.1 #4
    }
    if (r.type === RewardType.Token && r.skinId <= 0) return this._routeTokens(c, r.count);
    return Reward.clone(r);
  }

  /** §6.3.1: the owned skin missing the most tokens (with TokenAvailable >= count), else coins x2. */
  _routeTokens(c, count) {
    const cands = c.p.skins.filter(s => this.tokenAvailable(s) >= count);
    if (cands.length === 0) return reward(RewardType.Freemium, count * this.R.coinsPerSpareToken);
    let best = cands[c.rng.range(0, cands.length)];
    for (const s of cands) if (this.tokenAvailable(s) > this.tokenAvailable(best)) best = s;
    return reward(RewardType.Token, count, best.id);
  }

  _randomRewardSkin(c, rarity) {
    const cands = this._unownedSkins(c.p, rarity);
    if (cands.length === 0) return null;
    return reward(RewardType.Skin, 1, cands[c.rng.range(0, cands.length)].id);
  }

  /** RewardController.GetRewards for one concrete reward. */
  _apply(c, r, source, granted) {
    switch (r.type) {
      case RewardType.Skin: this._addSkin(c, r.skinId); break;
      case RewardType.Token: this._addToken(c, r.skinId, r.count); break;
      case RewardType.Freemium:
      case RewardType.Premium: this._addCurrency(c, CurrencyOfReward[r.type - RewardType.Freemium], r.count); break;
      case RewardType.Mode: if (r.id === this.R.missionUnlockModeId) this._unlockMissions(c); break;
      case RewardType.Stage: if (!c.p.stageUnlocked.includes(r.id)) c.p.stageUnlocked.push(r.id); break;
      case RewardType.Power: break; // display only: powers follow the skin level
    }
    granted.push(r);
    c.res.rewards.push(r);
    c.res.events.push(new RewardGranted(r, source));
  }

  // ---------------------------------------------------------------- difficulty

  _shiftDifficulty(c, delta) {
    const before = c.p.difficulty;
    c.p.difficulty = Math.max(0, Math.min(1, Math.fround(before + delta)));
    if (c.p.difficulty !== before) c.res.events.push(new DifficultyChanged(before, c.p.difficulty));
  }

  /** UserData.UpdateDifficultyFromRank: ranks outside 1..4 are ignored. */
  _difficultyFromRank(c, rank) {
    if (rank >= 1 && rank <= this.db.rankDifficulty.length) this._shiftDifficulty(c, this.db.rankDifficulty[rank - 1]);
  }

  _difficultyFromVictory(c, v) {
    const db = this.db;
    this._shiftDifficulty(c, v === 0 ? db.teamVictoryDifficulty : v === 2 ? db.teamDrawDifficulty : db.teamDefeatDifficulty);
  }

  // ---------------------------------------------------------------- achievements

  _stat(name) {
    const f = this._stats.get(name);
    if (!f) throw new Error("achievement stat '" + name + "' not found");
    return f;
  }

  /** Progress of a stat achievement; event achievements report 0/1. */
  achievementProgress(p, a) {
    return a.isEvent ? (p.achievements.includes(a.id) ? 1 : 0) : this._stat(a.stat)(p);
  }

  _checkAchievements(c) {
    for (const a of this.db.achievements) {
      if (!a.isEvent && !c.p.achievements.includes(a.id) && this._stat(a.stat)(c.p) >= a.threshold) this._unlockAchievement(c, a.id);
    }
  }

  _unlockAchievement(c, id) {
    if (c.p.achievements.includes(id)) return;
    let def = null;
    for (const a of this.db.achievements) if (a.id === id) def = a;
    if (def === null) return;
    c.p.achievements.push(id);
    c.res.events.push(new AchievementUnlocked(def));
  }

  // ---------------------------------------------------------------- name

  defaultName(rng) { return 'Player_' + rng.range(this.R.defaultNameMin, this.R.defaultNameMaxExcl); }

  /** UserData.NormalizeName: lower case, fold leet/accents, keep letters/digits, merge repeats. */
  static normalizeName(s) {
    let out = '';
    let prev = '\0';
    const low = lowerInvariant(s);
    for (let i = 0; i < low.length; i++) {
      const ch = FOLD.get(low[i]) ?? low[i];
      if (!isLetterOrDigit(ch) || ch === prev) continue;
      out += ch;
      prev = ch;
    }
    return out;
  }

  /** UserData.IsNameAllowed (§1.4 order: empty normalized name is allowed). */
  isNameAllowed(s) {
    if (s === null || s === undefined || s === '') return false;
    const n = MetaService.normalizeName(s);
    if (n.length === 0) return true;
    for (const w of this.db.allowedNameWords) if (n === MetaService.normalizeName(w)) return true;
    let raw = '';
    const low = lowerInvariant(s);
    for (let i = 0; i < low.length; i++) if (isLetterOrDigit(low[i])) raw += low[i];
    for (const b of this.db.bannedNameWords) if (n.includes(b) || raw.includes(b)) return false;
    return true;
  }

  /** EditName.NameEditingEnd: trim, keep the old name when empty, cut to 15, filter. */
  setName(p, name) {
    const res = new MetaResult();
    let t = (name ?? '').replace(CS_TRIM, '');
    if (t.length === 0) return res;
    if (t.length > this.R.nameMaxLength) t = t.substring(0, this.R.nameMaxLength);
    if (!this.isNameAllowed(t)) return MetaResult.fail(res, MetaErrors.NameNotAllowed);
    p.name = t;
    p.nameCustomized = true;
    return res;
  }

  // statics of the partial files
  static starForRank(rank) { return starForRank(rank); }
  static slotRemap(seed) { return slotRemap(seed); }
  static teamForSlot(slot, team, bossOnLeft) { return teamForSlot(slot, team, bossOnLeft); }
  static levelCoef(level) { return Math.fround(Math.fround(level * Math.fround(0.05)) + Math.fround(0.95)); }
}

// defineProperties, not assign: shopPart has a getter (iapProducts) that must stay a getter
for (const part of [skinsPart, leaguePart, missionsPart, matchPart, fridgePart, matchmakingPart, shopPart]) {
  Object.defineProperties(MetaService.prototype, Object.getOwnPropertyDescriptors(part));
}
