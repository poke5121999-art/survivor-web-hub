// Immutable meta data, port of FG.Meta Data/MetaDb.cs. Loads data/metadata.json (fg-metadata.json).
import { parseJson, getI, getF, getS, getInts, getStrings, field, FormatError } from './json.js';
import { Reward } from './types.js';

export class SkinDef {
  constructor(id, name, rarity) { this.id = id; this.name = name; this.rarity = rarity; Object.freeze(this); }
}

/** Cost to go from level L to L+1 (GameData.m_skinLevelThreshold[L-1]). */
export class LevelCost {
  constructor(token, coins) { this.token = token; this.coins = coins; Object.freeze(this); }
}

export class PowerDef {
  constructor(skinId, slot, type, value) { this.skinId = skinId; this.slot = slot; this.type = type; this.value = value; Object.freeze(this); }
  get powerId() { return this.slot + 1; }
}

/** One trophy-road row. A row with a name is a sub-league, a nameless row is a step. */
export class LeagueRow {
  constructor(index, id, name, threshold, reward) {
    this.index = index; this.id = id; this.name = name ?? ''; this.threshold = threshold; this.reward = reward;
    Object.freeze(this);
  }
  get isSubLeague() { return this.name.length > 0; }
  /** League.Available's "has content" part: a skin, a count, or a Mode/Box type. */
  get hasReward() {
    const r = this.reward;
    return r !== null && (r.skinId >= 1 || r.count >= 1 || r.type === 5 /* Mode */ || Reward.isBox(r));
  }
}

export class ModeDef {
  constructor(text, goal, team) { this.text = text; this.goal = goal; this.team = team; Object.freeze(this); }
}

export class MissionDef {
  constructor(id, text, skinMode, mode) { this.id = id; this.text = text; this.skinMode = skinMode; this.mode = mode; Object.freeze(this); }
}

export class ShopItemDef {
  constructor(id, group, priceType, price, reward) {
    this.id = id; this.group = group; this.priceType = priceType; this.price = price; this.reward = reward;
    Object.freeze(this);
  }
}

export class LeaguePackDef {
  constructor(id, threshold, reward1, reward2, discount) {
    this.id = id; this.threshold = threshold; this.reward1 = reward1; this.reward2 = reward2; this.discount = discount;
    Object.freeze(this);
  }
}

export class MapDef {
  constructor(index, stageId, scene) { this.index = index; this.stageId = stageId; this.scene = scene; Object.freeze(this); }
}

/** Fridge size: number of small fridges and how many skins share the tokens (§6.3.2). */
export class BoxSpec {
  constructor(type, slots, kMin, kMaxExcl) { this.type = type; this.slots = slots; this.kMin = kMin; this.kMaxExcl = kMaxExcl; Object.freeze(this); }
}

export class AchievementDef {
  constructor(id, name, stat, threshold) { this.id = id; this.name = name; this.stat = stat; this.threshold = threshold; Object.freeze(this); }
  get isEvent() { return this.stat === 'event'; }
}

const items = (n, key) => { const v = field(n, key); return Array.isArray(v) ? v : []; };
// db rewards are shared by every profile: frozen so a missing clone fails loudly
const rd = n => { const r = Reward.read(n); return r && Object.freeze(r); };
const rdList = n => Object.freeze(Reward.readList(n).map(r => r && Object.freeze(r)));
const readMode = n => new ModeDef(getS(n, 'text'), getI(n, 'goal'), getI(n, 'team'));

function parseGroup(g) {
  switch (g) {
    case 'shopItemsBox': return 0;
    case 'shopItemsPremium': return 1;
    case 'shopItemsFreemium': return 2;
    case 'dailyPaidOffers': return 3;
    default: throw new FormatError("metadata: unknown shop group '" + g + "'");
  }
}

export class MetaDb {
  /** @param {string|object} json metadata.json text or its parsed object */
  static load(json) {
    const root = typeof json === 'string' ? parseJson(json) : json;
    const db = new MetaDb();
    db.version = getI(root, 'version');

    db.skins = items(root, 'skins').map(n => new SkinDef(getI(n, 'id'), getS(n, 'name'), getI(n, 'rarity')));
    db._skinById = new Map();
    for (const s of db.skins) db._skinById.set(s.id, s);
    db.weeklySkinOrder = getInts(root, 'weeklySkinOrder');
    db.skinLevels = items(root, 'skinLevels').map(n => new LevelCost(getI(n, 'token'), getI(n, 'coins')));
    db.powers = items(root, 'powers').map(n => new PowerDef(getI(n, 'skinId'), getI(n, 'slot'), getS(n, 'type'), getF(n, 'value')));
    db.leagues = items(root, 'leagues').map((n, i) =>
      new LeagueRow(i, getI(n, 'id'), getS(n, 'name'), getI(n, 'threshold'), rd(field(n, 'reward'))));

    db.trophiesPerRank = getInts(root, 'trophiesPerRank');
    const diff = field(root, 'difficulty');
    db.rankDifficulty = items(diff, 'rankModifiers').map(x => Math.fround(x));
    db.teamVictoryDifficulty = getF(diff, 'teamVictory');
    db.teamDefeatDifficulty = getF(diff, 'teamDefeat');
    db.teamDrawDifficulty = getF(diff, 'teamDraw');

    db.defaultMode = readMode(field(root, 'defaultMode'));
    db.randomModes = items(root, 'randomModes').map(readMode);
    db.missions = items(root, 'missions').map(n =>
      new MissionDef(getI(n, 'id'), getS(n, 'text'), getI(n, 'skinMode'), readMode(field(n, 'mode'))));
    db.rewardMission = rdList(field(root, 'rewardMission'));
    db.dailyGifts = items(root, 'dailyGifts').map(pool => rdList(pool));

    db.shop = items(root, 'shop').map(n =>
      new ShopItemDef(getS(n, 'id'), parseGroup(getS(n, 'group')), getI(n, 'priceType'), getI(n, 'price'), rd(field(n, 'reward'))));
    db.leaguePacks = items(root, 'leaguePacks').map(n =>
      new LeaguePackDef(getS(n, 'id'), getI(n, 'threshold'), rd(field(n, 'reward1')), rd(field(n, 'reward2')), getS(n, 'discount')));
    db.gameOverBoxPremiumPrice = getI(root, 'gameOverBoxPremiumPrice');

    db.maps = items(root, 'maps').map(n => new MapDef(getI(n, 'index'), getI(n, 'stageId'), getS(n, 'scene')));
    db.botNames = getStrings(root, 'botNames');
    db.bannedNameWords = getStrings(root, 'bannedNameWords');
    db.allowedNameWords = getStrings(root, 'allowedNameWords');
    db.achievements = items(root, 'achievements').map(n =>
      new AchievementDef(getS(n, 'id'), getS(n, 'name'), getS(n, 'stat'), getI(n, 'threshold')));

    const r = field(root, 'rules');
    db.rules = Object.freeze({
      maxStar: getI(r, 'maxStar'), maxRewardStock: getI(r, 'maxRewardStock'), freeFridgeOpens: getI(r, 'freeFridgeOpens'),
      maxSkinLevel: getI(r, 'maxSkinLevel'), currencyCap: getI(r, 'currencyCap'), trophyCap: getI(r, 'trophyCap'),
      powerUnlockLevels: getInts(r, 'powerUnlockLevels'),
      skinPityStart: getF(r, 'skinPityStart'), skinPityBase: getF(r, 'skinPityBase'), skinPityStep: getF(r, 'skinPityStep'),
      epicChance: getF(r, 'epicChance'),
      boxCoinMin: getI(r, 'boxCoinMin'), boxCoinMaxExcl: getI(r, 'boxCoinMaxExcl'), coinsPerSpareToken: getI(r, 'coinsPerSpareToken'),
      boxCoinFracMin: getF(r, 'boxCoinFracMin'), boxCoinFracMax: getF(r, 'boxCoinFracMax'),
      boxSplitLo: getF(r, 'boxSplitLo'), boxSplitHi: getF(r, 'boxSplitHi'), boxSplitStep: getF(r, 'boxSplitStep'),
      specialBoxFirstThreshold: getI(r, 'specialBoxFirstThreshold'), specialBoxMin: getI(r, 'specialBoxMin'),
      specialBoxMaxExcl: getI(r, 'specialBoxMaxExcl'),
      vipBoxDiscount: getF(r, 'vipBoxDiscount'), vipPriceStep: getI(r, 'vipPriceStep'), promoSkinPrice: getI(r, 'promoSkinPrice'),
      specialOfferPriceRare: getI(r, 'specialOfferPriceRare'), specialOfferPriceEpic: getI(r, 'specialOfferPriceEpic'),
      vipSkinId: getI(r, 'vipSkinId'), vipAdThresholds: getInts(r, 'vipAdThresholds'),
      vipWeekDays: getI(r, 'vipWeekDays'), vipMonthDays: getI(r, 'vipMonthDays'), leaguePackWindowSec: getI(r, 'leaguePackWindowSec'),
      missionsPerWeek: getI(r, 'missionsPerWeek'), missionBox2Index: getI(r, 'missionBox2Index'),
      missionBox3Index: getI(r, 'missionBox3Index'), missionUnlockModeId: getI(r, 'missionUnlockModeId'),
      botLevelSpread: getI(r, 'botLevelSpread'), botLevelNoiseMin: getI(r, 'botLevelNoiseMin'),
      botLevelNoiseMaxExcl: getI(r, 'botLevelNoiseMaxExcl'), botNameTries: getI(r, 'botNameTries'),
      botAggroBiasMin: getF(r, 'botAggroBiasMin'), botAggroBiasMax: getF(r, 'botAggroBiasMax'), botAggroNoise: getF(r, 'botAggroNoise'),
      friendRoomDifficulties: getInts(r, 'friendRoomDifficulties'),
      nameMaxLength: getI(r, 'nameMaxLength'), defaultNameMin: getI(r, 'defaultNameMin'),
      defaultNameMaxExcl: getI(r, 'defaultNameMaxExcl'), carnageKills: getI(r, 'carnageKills'),
      fallbackSkinCoins: getI(r, 'fallbackSkinCoins'),
    });
    db.boxes = items(r, 'boxes').map(n => new BoxSpec(getI(n, 'type'), getI(n, 'slots'), getI(n, 'kMin'), getI(n, 'kMaxExcl')));
    return db;
  }

  findSkin(id) { return this._skinById.get(id) ?? null; }

  box(t) { return this.boxes.find(b => b.type === t) ?? null; }

  /** GameData.LevelThreshold: cost from level to level+1, null at max level. */
  levelCost(level) {
    const i = level - 1;
    return i >= 0 && i < this.skinLevels.length ? this.skinLevels[i] : null;
  }

  findShopItem(group, id) { return this.shop.find(s => s.group === group && s.id === id) ?? null; }

  shopGroupItems(group) { return this.shop.filter(s => s.group === group); }

  findLeaguePack(id) { return this.leaguePacks.find(p => p.id === id) ?? null; }

  findMission(id) { return this.missions.find(m => m.id === id) ?? null; }

  findPower(skinId, powerId) { return this.powers.find(p => p.skinId === skinId && p.powerId === powerId) ?? null; }

  // ---- trophy road lookups (UserData.League / SubLeague / StepLeagueNext, META §4.3)

  /** Last row with threshold <= trophies (row 0 when below all). */
  leagueAt(trophies) {
    let r = this.leagues[0];
    for (const l of this.leagues) if (l.threshold <= trophies) r = l;
    return r;
  }

  /** Last named row with threshold <= trophies. */
  subLeagueAt(trophies) {
    let r = this.leagues[0];
    for (const l of this.leagues) if (l.isSubLeague && l.threshold <= trophies) r = l;
    return r;
  }

  /** Next row, null when the next row is the last (end-of-road marker). */
  stepNext(trophies) {
    const i = this.leagueAt(trophies).index;
    return this.leagues.length - 1 <= i + 1 ? null : this.leagues[i + 1];
  }

  /** League.Max: threshold of the next row (the last row's own threshold). */
  maxOf(row) {
    return row.index === this.leagues.length - 1 ? row.threshold : this.leagues[row.index + 1].threshold;
  }

  /** GameData.LeaguePack: pack with the highest threshold <= trophies, null below the first. */
  leaguePackAt(trophies) {
    let r = null;
    for (const p of this.leaguePacks) { if (trophies < p.threshold) break; r = p; }
    return r;
  }

  trophyForRank(rank) {
    return rank >= 1 && rank <= this.trophiesPerRank.length ? this.trophiesPerRank[rank - 1] : 0;
  }
}
