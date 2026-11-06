// MetaService.League.cs: trophies, trophy road, league packs.
import { MetaRng, MetaTime } from './rng.js';
import { RewardType, RoadStepState, MetaErrors } from './types.js';
import { Profile } from './profile.js';
import { MetaResult, LeagueUp, TrophiesChanged, LeagueOfferUnlocked, LeaguePackOffer } from './events.js';

export const leaguePart = {
  /** UserData.AddLeaguePoint (§4.4). Trophies never drop below the current sub-league floor. */
  _addTrophies(c, delta) {
    const p = c.p, db = this.db;
    const before = p.trophies;
    const oldSub = db.subLeagueAt(before);
    const oldRow = db.leagueAt(before);
    const v = Math.min(before + delta, this.R.trophyCap);
    p.trophies = oldSub.threshold <= v ? v : oldSub.threshold;

    const row = db.leagueAt(p.trophies);
    if (row !== oldSub) p.lastLeagueChange = c.t;
    if (row !== oldRow && row.isSubLeague) c.res.events.push(new LeagueUp(row));
    c.res.events.push(new TrophiesChanged(before, p.trophies));

    const pack = db.leaguePackAt(p.trophies);
    if (pack !== null && !p.leaguePacksBought.includes(pack.id) && pack.threshold > before && p.trophies >= pack.threshold) {
      c.res.events.push(new LeagueOfferUnlocked(pack));
    }
    this._checkAchievements(c);
  },

  /** League.Available: reached, has content, and not claimed (or a skin reward whose skin is missing). */
  isRoadStepAvailable(p, row) {
    return p.trophies >= row.threshold && row.hasReward &&
      (!p.roadClaimed.includes(row.id) || (row.reward.type === RewardType.Skin && !Profile.hasSkin(p, row.reward.skinId)));
  },

  roadStep(p, row) {
    if (!row.hasReward) return RoadStepState.Empty;
    if (this.isRoadStepAvailable(p, row)) return RoadStepState.Available;
    return p.trophies >= row.threshold && p.roadClaimed.includes(row.id) ? RoadStepState.Claimed : RoadStepState.Locked;
  },

  /** LeagueDisplay: the last claimable row (red dot), null when none. */
  roadRewardToCollect(p) {
    let last = null;
    for (const row of this.db.leagues) if (this.isRoadStepAvailable(p, row)) last = row;
    return last;
  },

  /** Progress of a row's bar: (trophies - threshold) / (Max - threshold), clamped 0..1. */
  roadProgress(p, row) {
    const max = this.db.maxOf(row);
    if (max <= row.threshold) return p.trophies >= row.threshold ? 1 : 0;
    const f = Math.fround(Math.fround(p.trophies - row.threshold) / Math.fround(max - row.threshold));
    return Math.max(0, Math.min(1, f));
  },

  /** LeagueRewardDisplay.ClaimReward: rewards are claimed by hand, one row at a time. */
  claimRoadStep(p, rowId, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    let row = null;
    for (const l of this.db.leagues) if (l.id === rowId) row = l;
    if (row === null) return MetaResult.fail(c.res, MetaErrors.UnknownItem);
    if (!this.isRoadStepAvailable(p, row)) {
      return MetaResult.fail(c.res, p.roadClaimed.includes(row.id) ? MetaErrors.AlreadyClaimed : MetaErrors.NotAvailable);
    }
    if (!p.roadClaimed.includes(row.id)) p.roadClaimed.push(row.id);
    this._grant(c, row.reward, 'League');
    return c.res;
  },

  /** UserData.LeaguePackTimeLeft: 24 h from the last league row change (may be <= 0). */
  leaguePackTimeLeft(p, utcNow) {
    return p.lastLeagueChange + this.R.leaguePackWindowSec - MetaTime.seconds(utcNow);
  },

  /** DailyOfferSystem.ComputeSpecialLeagueOffer: Saturday UTC, window closed, a reached pack not bought. */
  saturdayLeagueOffer(p, utcNow) {
    const t = MetaTime.seconds(utcNow);
    if (MetaTime.weekdayIndex(t) !== 5 || this.leaguePackTimeLeft(p, utcNow) > 0) return null;
    const cands = this.db.leaguePacks.filter(k => p.trophies >= k.threshold && !p.leaguePacksBought.includes(k.id));
    if (cands.length === 0) return null;
    const rng = new MetaRng(MetaTime.dayStart(t) + 99);
    return cands[rng.range(0, cands.length)];
  },

  /** Shop.BuyLeaguePack's choice: the Saturday special first, else the pack of the current trophies. */
  activeLeaguePack(p, utcNow) {
    const t = MetaTime.seconds(utcNow);
    const special = this.saturdayLeagueOffer(p, utcNow);
    if (special !== null) return new LeaguePackOffer(special, MetaTime.dayStart(t) + MetaTime.Day - t, true);
    const pack = this.db.leaguePackAt(p.trophies);
    const left = this.leaguePackTimeLeft(p, utcNow);
    if (pack === null || p.leaguePacksBought.includes(pack.id) || left <= 0) return null;
    return new LeaguePackOffer(pack, left, false);
  },
};
