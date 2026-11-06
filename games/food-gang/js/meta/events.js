// Events, results and match types, port of FG.Meta Service/MetaEvents.cs + MatchTypes.cs.
import { Reward, RewardType, Currency } from './types.js';

/** Something the UI may react to. Each operation returns them in the order they happened. */
export class MetaEvent {
  get type() { return this.constructor.name; }
  toString() { return this.type; }
}

export class RewardGranted extends MetaEvent {
  /** reward: the concrete reward (after box roll / token routing); source: "Box2", "League", "Mission"... */
  constructor(reward, source) { super(); this.reward = reward; this.source = source; }
  toString() { return 'RewardGranted ' + Reward.toString(this.reward) + ' from ' + this.source; }
}

export class CurrencyChanged extends MetaEvent {
  constructor(currency, delta, balance) { super(); this.currency = currency; this.delta = delta; this.balance = balance; }
  toString() { return `CurrencyChanged ${Currency.name(this.currency)} ${this.delta > 0 ? '+' : ''}${this.delta} = ${this.balance}`; }
}

export class SkinUnlocked extends MetaEvent {
  constructor(skinId) { super(); this.skinId = skinId; }
  toString() { return 'SkinUnlocked ' + this.skinId; }
}

export class TokensAdded extends MetaEvent {
  constructor(skinId, count) { super(); this.skinId = skinId; this.count = count; }
}

export class SkinLevelUp extends MetaEvent {
  constructor(skinId, level) { super(); this.skinId = skinId; this.level = level; }
  toString() { return `SkinLevelUp ${this.skinId} -> ${this.level}`; }
}

export class PowerUnlocked extends MetaEvent {
  constructor(skinId, powerId) { super(); this.skinId = skinId; this.powerId = powerId; }
  toString() { return `PowerUnlocked ${this.skinId}.${this.powerId}`; }
}

export class TrophiesChanged extends MetaEvent {
  constructor(before, after) { super(); this.before = before; this.after = after; }
}

/** Reached a named row of the trophy road (NewLeagueEvent). row: a LeagueRow. */
export class LeagueUp extends MetaEvent {
  constructor(row) { super(); this.row = row; }
  toString() { return `LeagueUp ${this.row.name} @${this.row.threshold}`; }
}

/** The match just crossed the threshold of a league pack not bought yet (SceneOfferLeague popup). */
export class LeagueOfferUnlocked extends MetaEvent {
  constructor(pack) { super(); this.pack = pack; }
}

export class StarsChanged extends MetaEvent {
  constructor(stars, stock) { super(); this.stars = stars; this.stock = stock; }
}

export class FridgeEarned extends MetaEvent {
  constructor(box) { super(); this.box = box; }
  toString() { return 'FridgeEarned ' + RewardType.name(this.box); }
}

export class FridgeStockRefilled extends MetaEvent {
  constructor(stock) { super(); this.stock = stock; }
}

export class BoxOpened extends MetaEvent {
  constructor(box, contents) { super(); this.box = box; this.contents = contents; }
  toString() { return 'BoxOpened ' + RewardType.name(this.box) + ' [' + this.contents.map(Reward.toString).join(', ') + ']'; }
}

export class MissionsUnlocked extends MetaEvent {}

export class MissionsRefreshed extends MetaEvent {
  constructor(week) { super(); this.week = week; }
}

export class MissionCompleted extends MetaEvent {
  constructor(index) { super(); this.index = index; }
}

export class DailyOffersRefreshed extends MetaEvent {
  constructor(day) { super(); this.day = day; }
}

export class VipChanged extends MetaEvent {
  constructor(vipUntil) { super(); this.vipUntil = vipUntil; }
}

export class AchievementUnlocked extends MetaEvent {
  constructor(achievement) { super(); this.achievement = achievement; }
  toString() { return 'AchievementUnlocked ' + this.achievement.id; }
}

export class DifficultyChanged extends MetaEvent {
  constructor(before, after) { super(); this.before = before; this.after = after; }
}

/** Outcome of one meta operation. error is an info.* text key ("info.notenough.premium"...). */
export class MetaResult {
  constructor() {
    this.ok = true;
    this.error = null;
    this.events = [];
    this.rewards = []; // concrete rewards granted
  }

  static fail(r, error) { r.ok = false; r.error = error; return r; }

  /** First event of that class (C# Find<T>), or null. */
  find(EventClass) { return this.events.find(e => e instanceof EventClass) ?? null; }

  all(EventClass) { return this.events.filter(e => e instanceof EventClass); }

  toString() { return this.ok ? 'ok: ' + this.events.join('; ') : 'error: ' + this.error; }
}

/** One of the four match slots. A later adapter maps this onto the simulation setup. */
export class MatchSlot {
  constructor(init = {}) {
    this.slot = 0;            // 0..3
    this.team = 0;            // GetTeamForSlot
    this.skinId = 0;
    this.level = 1;
    this.isBot = false;
    this.isAlly = false;      // bot on the player's team
    this.botNameIndex = -1;   // index into MetaDb.botNames
    this.name = null;
    this.botAggro = -1;       // 0..100; -1 for the player
    Object.assign(this, init);
  }
  get botDifficulty() { return this.botAggro < 0 ? 0 : Math.fround(this.botAggro / 100); }
}

/** Everything needed to start a match (QuantumMatchmaker SetupOfflineSession + LaunchGameAsync). */
export class MatchRequest {
  constructor(init = {}) {
    this.goal = 0;
    this.team = 0;
    this.modeText = null;
    this.modeIndex = -1;      // index in MetaDb.randomModes when drawn from the deck
    this.mapIndex = 0;        // 0 Kitchen, 1 Dining table, 2 Pantry
    this.stageId = 0;
    this.seed = 0;
    this.bossOnLeft = false;
    this.localSlot = 0;
    this.missionIndex = -1;   // profile.missions.slots index, -1 = not a mission
    this.isFriendRoom = false; // custom match: no trophies, stars or difficulty change
    this.isTutorial = false;
    this.hostLevel = 0;
    this.hostDifficulty = 0;
    this.botDifficultyInt = 0;
    this.slots = [null, null, null, null];
    Object.assign(this, init);
  }
  get isMission() { return this.missionIndex >= 0; }
  get player() { return this.slots[this.localSlot]; }
}

/** Options for a custom (private-room style) match played offline against bots (§13.4). */
export class CustomMatchOptions {
  constructor(init = {}) {
    this.modeIndex = -1;      // -1 = draw from the deck
    this.mapIndex = -1;       // -1 = random
    this.difficultyInt = 50;  // 0 / 25 / 50 / 75 / 100
    Object.assign(this, init);
  }
}

/** What the simulation reports at the end of a match. */
export class MatchOutcome {
  constructor(init = {}) {
    this.rank = 0;            // FFA: 1..4. Ignored for team modes.
    this.winnerTeam = 0;      // team modes: winning team, 0 = draw or quit early
    this.kills = 0;
    this.deaths = 0;
    this.jumps = 0;
    this.specialKill = false;
    this.quitEarly = false;   // team modes become a draw (§5.7)
    Object.assign(this, init);
  }
}

/** Result-screen data (GameOver) plus the events of applyMatchResult. */
export class MatchResult extends MetaResult {
  constructor() {
    super();
    this.rank = 0;            // 1..4, team: 1 win / 4 loss / 0 draw
    this.victory = 0;
    this.trophiesGained = 0;
    this.starsGained = 0;
    this.starStart = 0;
    this.starEnd = 0;
    this.rewardPanel = false;
    this.fridgeBox = 0;       // 0 = no fridge to open on this screen
    this.canOpenFree = false;
    this.canOpenAdOrGems = false;
    this.fridgeGemPrice = 0;
    this.missionCompleted = false;
    this.difficultyBefore = 0;
    this.difficultyAfter = 0;
  }
  get hasFridge() { return this.fridgeBox !== 0; }
}

export class MatchRequestResult extends MetaResult {
  constructor() { super(); this.request = null; }
}

/** A daily gift cell as the Shop shows it. */
export class DailyGiftView {
  constructor() {
    this.slot = 0;
    this.reward = null;
    this.priceType = 0;       // Free / Ad / VipOnly (VIP: all Free)
    this.claimed = false;
    this.adsWatched = 0;      // VipOnly cells unlocked by ads
    this.adsNeeded = 0;
  }
}

/** The league pack currently on sale (SceneOfferLeague / Shop cell). */
export class LeaguePackOffer {
  constructor(pack, secondsLeft, saturdaySpecial = false) {
    this.pack = pack; this.secondsLeft = secondsLeft; this.saturdaySpecial = saturdaySpecial;
  }
}

/** One store product (IAPSystem product list, §11.1). Web: claiming it is the purchase. */
export class IapProduct {
  constructor(id, kind, vipDays = 0) { this.id = id; this.kind = kind; this.vipDays = vipDays; Object.freeze(this); }
}
