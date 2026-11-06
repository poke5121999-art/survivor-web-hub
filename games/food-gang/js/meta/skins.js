// MetaService.Skins.cs: levels, powers, collection.
import { RewardType, MetaErrors, reward } from './types.js';
import { Profile } from './profile.js';
import { MetaResult, SkinLevelUp, PowerUnlocked, RewardGranted } from './events.js';
import { Currency } from './types.js';

export const skinsPart = {
  /** SkinProgression.PowersUnlocked: power ids 1..4 open at levels 5/10/15/20. */
  powersUnlocked(level) {
    const list = [];
    const lv = this.R.powerUnlockLevels;
    for (let i = 0; i < lv.length; i++) if (level >= lv[i]) list.push(i + 1);
    return list;
  },

  canUpgradeTokens(s) {
    const cost = this.db.levelCost(s.level);
    return s.level < this.R.maxSkinLevel && cost !== null && s.tokens >= cost.token;
  },

  canUpgrade(p, s) {
    const cost = this.db.levelCost(s.level);
    return this.canUpgradeTokens(s) && p.coins >= cost.coins;
  },

  /** UserData.AlertUpgrade: some owned skin has enough tokens (coins not checked). */
  alertUpgrade(p) { return p.skins.some(s => this.canUpgradeTokens(s)); },

  alertCollection(p) { return p.newSkins.length > 0; },

  /** Collection order: owned skins (GameData order) then the rest. */
  collectionOrder(p) {
    const owned = [], rest = [];
    for (const s of this.db.skins) (Profile.hasSkin(p, s.id) ? owned : rest).push(s);
    return owned.concat(rest);
  },

  /** SkinController.Upgrade (§3.3): coins checked before tokens; each upgrade lowers difficulty by 0.1. */
  upgradeSkin(p, skinId, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    const s = Profile.skin(p, skinId);
    if (s === null) return MetaResult.fail(c.res, MetaErrors.SkinNotOwned);
    const cost = this.db.levelCost(s.level);
    if (s.level >= this.R.maxSkinLevel || cost === null) return MetaResult.fail(c.res, MetaErrors.SkinMaxLevel);
    if (p.coins < cost.coins) return MetaResult.fail(c.res, MetaErrors.NotEnoughCoins);
    if (s.tokens < cost.token) return MetaResult.fail(c.res, MetaErrors.NotEnoughTokens);

    s.tokens -= cost.token;
    this._addCurrency(c, Currency.Coins, -cost.coins);
    s.level++;
    c.res.events.push(new SkinLevelUp(skinId, s.level));
    const lv = this.R.powerUnlockLevels;
    for (let i = 0; i < lv.length; i++) {
      if (s.level !== lv[i]) continue;
      c.res.events.push(new PowerUnlocked(skinId, i + 1));
      const shown = reward(RewardType.Power, 1, skinId, i + 1);
      c.res.rewards.push(shown);
      c.res.events.push(new RewardGranted(shown, 'Upgrade'));
    }
    this._difficultyFromRank(c, 2);
    this._checkAchievements(c);
    return c.res;
  },

  selectSkin(p, skinId) {
    const res = new MetaResult();
    if (!Profile.hasSkin(p, skinId)) return MetaResult.fail(res, MetaErrors.SkinNotOwned);
    p.skinSelected = skinId;
    return res;
  },

  /** SkinStatManager.Start: viewing a skin clears its NEW badge. */
  markSkinSeen(p, skinId) {
    const i = p.newSkins.indexOf(skinId);
    if (i >= 0) p.newSkins.splice(i, 1);
  },
};
