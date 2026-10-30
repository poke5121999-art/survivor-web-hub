// Enums and Reward, port of FG.Meta Data/Types.cs. Numeric values match the original enums.
import { getI } from './json.js';

const enumOf = names => {
  const e = {};
  names.forEach((n, i) => { if (n) e[n] = i; });
  e.name = v => names[v] ?? String(v);
  return Object.freeze(e);
};

export const RewardType = enumOf(['Skin', 'Token', 'Freemium', 'Premium', 'Power', 'Mode', 'Box1', 'Box2', 'Box3', 'Stage']);
export const Currency = enumOf(['Coins', 'Gems']);
export const Rarity = enumOf(['Common', 'Rare', 'Epic', 'Vip']);
export const PriceType = enumOf(['Freemium', 'Premium', 'InApp', 'Free', 'Ad', 'VipOnly']);
export const GoalType = enumOf(['DeathMatch', 'Kill5', 'LastSurvivor', 'KillBoss', 'Random']);
export const TeamConfig = enumOf(['FreeForAll', 'OneVersusThree', 'TwoVersusTwo', 'Random']);
export const SkinMode = enumOf(['Free', 'Forced', 'ForcedAllSame', 'SameAsPlayer', 'RandomSkinOnSpawn']);
export const Victory = enumOf(['Victory', 'Defeat', 'Draw']);
/** How the player pays for the after-match fridge (GameOver buttons). */
export const FridgeOpenMethod = enumOf(['Free', 'Ad', 'Gems']);
/** Rewarded-ad buttons. Web: the click itself is the completed ad. */
export const AdPlacement = enumOf(['DailyGiftAd', 'DailyGiftVip1', 'DailyGiftVip2', 'FridgeOpen']);
/** The four daily gift cells, in Shop order. */
export const DailyGiftSlot = enumOf(['Free', 'Ad', 'Vip1', 'Vip2']);
export const ShopGroup = enumOf(['Box', 'Premium', 'Freemium', 'DailyPaid']);
export const RoadStepState = enumOf(['Locked', 'Available', 'Claimed', 'Empty']);
export const IapKind = enumOf(['Pass', 'GemPack', 'DailySpecial', 'LeaguePack']);

/**
 * One reward as the original RewardData. Plain object { type, count, skinId, powerId, id } so it
 * serializes straight into the profile.
 */
export function reward(type, count = 1, skinId = 0, powerId = 0, id = 0) {
  return { type, count, skinId, powerId, id };
}

export const Reward = {
  create: reward,
  clone: r => reward(r.type, r.count, r.skinId, r.powerId, r.id),
  isBox: r => r.type === RewardType.Box1 || r.type === RewardType.Box2 || r.type === RewardType.Box3,
  toString: r => (r.skinId > 0 ? `${RewardType.name(r.type)} x${r.count} (skin ${r.skinId})` : `${RewardType.name(r.type)} x${r.count}`),

  /** Reward.Read: null for a missing or null node. */
  read(n) {
    if (n === undefined || n === null) return null;
    return reward(getI(n, 'type'), getI(n, 'count', 1), getI(n, 'skinId'), getI(n, 'powerId'), getI(n, 'id'));
  },

  readList(n) {
    return Array.isArray(n) ? n.map(Reward.read) : [];
  },

  /** Ordered plain object for writeJson (key order of Reward.Write). */
  toPlain(r) {
    return r === null ? null : { type: r.type, count: r.count, skinId: r.skinId, powerId: r.powerId, id: r.id };
  },
};


export const MetaErrors = Object.freeze({
  NotEnoughCoins: 'info.notenough.freemium',
  NotEnoughGems: 'info.notenough.premium',
  NotEnoughTokens: 'info.notenough.token',
  NameNotAllowed: 'info.nickname.notallowed',
  SkinNotOwned: 'skin not owned',
  SkinMaxLevel: 'skin already at max level',
  UnknownItem: 'item not found',
  AlreadyClaimed: 'already claimed',
  NotAvailable: 'not available',
  NoFridge: 'no fridge waiting to open',
  MissionLocked: 'mission locked',
  NotForSale: 'not for sale',
});
