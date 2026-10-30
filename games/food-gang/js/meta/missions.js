// MetaService.Missions.cs: weekly missions.
import { MetaRng, MetaTime } from './rng.js';
import { RewardType, SkinMode, MetaErrors, Reward, reward } from './types.js';
import { missionRewardAvailable, newMissionSlot } from './profile.js';
import { MetaResult, MissionsUnlocked, MissionsRefreshed, MissionCompleted } from './events.js';

export const missionsPart = {
  /** MissionSystem.WeeklySkinId: skin promoted this week (offset 0) or next week (1). */
  weeklySkinId(utcNow, weekOffset) { return this._weeklySkinIdAt(MetaTime.seconds(utcNow), weekOffset); },

  _weeklySkinIdAt(t, weekOffset) {
    const order = this.db.weeklySkinOrder;
    if (order.length === 0) return 0;
    const w = MetaTime.currentWeek(t) + weekOffset;
    return order[((w % order.length) + order.length) % order.length];
  },

  /** Mission.Unlocked: slot i opens on weekday i (Monday = 0, UTC). */
  isMissionUnlocked(s, utcNow) { return s.index < MetaTime.weekdayIndex(MetaTime.seconds(utcNow)) + 1; },

  /** Seconds until a locked mission slot opens (mission.timer). */
  missionUnlocksIn(s, utcNow) {
    const t = MetaTime.seconds(utcNow);
    const level = MetaTime.weekdayIndex(t) + 1;
    const next = MetaTime.dayStart(t) + MetaTime.Day - t;
    return s.index < level ? 0 : next + Math.max(0, s.index - level) * MetaTime.Day;
  },

  /** Seconds until the weekly reset (Monday 00:00 UTC). */
  missionWeekEndsIn(utcNow) {
    const t = MetaTime.seconds(utcNow);
    return MetaTime.weekStart(t) + MetaTime.Week - t;
  },

  missionAlert(p) { return p.missions.slots.some(missionRewardAvailable); },

  /** MissionSystem.UnlockMissions (league row 7, Mode id 2). */
  _unlockMissions(c) {
    const m = c.p.missions;
    if (m.unlocked) return;
    m.unlocked = true;
    c.res.events.push(new MissionsUnlocked());
    this._refreshMissions(c);
  },

  /** MissionSystem.RefreshMissions: once per UTC week, 7 missions seeded by the week start. */
  _refreshMissions(c) {
    const m = c.p.missions, db = this.db;
    const week = MetaTime.currentWeek(c.t);
    if (m.week === week) return;
    const seeded = new MetaRng(MetaTime.weekStart(c.t));
    m.week = week;
    m.slots.length = 0;

    const weekly = this._weeklySkinIdAt(c.t, 0);
    if (m.missionSkin === 0) {
      const next = this._weeklySkinIdAt(c.t, 1);
      const owned = c.p.skins.filter(s => s.id !== next && db.findSkin(s.id) !== null).map(s => s.id);
      if (owned.length > 0) m.missionSkin = owned[c.rng.range(0, owned.length)];
    } else if (m.missionSkin !== weekly) m.missionSkin = weekly;

    let prev = null;
    while (m.slots.length < this.R.missionsPerWeek) {
      const data = db.missions[seeded.range(0, db.missions.length)];
      if (prev === null || data.mode.goal !== prev.goal || data.mode.team !== prev.team) {
        m.slots.push(this._newMission(seeded, data, m.slots.length));
      }
      prev = data.mode;
    }
    c.res.events.push(new MissionsRefreshed(week));
  },

  /** Mission(MissionData, index): forced opponent skins, then the reward (slot 4 Box2, slot 7 Box3). */
  _newMission(rng, data, index) {
    const db = this.db;
    const slot = newMissionSlot(index, data.id);
    const forced = data.skinMode === SkinMode.Forced ? 3 : data.skinMode === SkinMode.ForcedAllSame ? 1 : 0;
    for (let i = 0; i < forced; i++) slot.forcedSkins.push(db.skins[rng.range(0, db.skins.length)].id);
    slot.reward = index === this.R.missionBox3Index ? reward(RewardType.Box3)
      : index === this.R.missionBox2Index ? reward(RewardType.Box2)
        : Reward.clone(db.rewardMission[rng.range(0, db.rewardMission.length)]);
    return slot;
  },

  /** Mission.Progress on a won mission match. Returns true when it just completed. */
  _progressMission(c, index) {
    const m = c.p.missions;
    if (!m.unlocked || index < 0 || index >= m.slots.length) return false;
    const s = m.slots[index];
    if (s.completed) return false;
    s.progress = Math.min(s.progress + 1, 1);
    if (s.progress < 1) return false;
    s.completed = true;
    c.p.stats.missionsCompleted++;
    c.res.events.push(new MissionCompleted(index));
    const done = m.slots.filter(x => x.completed).length;
    if (done >= this.R.missionsPerWeek) this._unlockAchievement(c, 'FULL_WEEK');
    return true;
  },

  /** MissionDisplay.Claim: completed and not claimed yet. */
  claimMission(p, index, utcNow, rng) {
    const c = this._begin(p, utcNow, rng, new MetaResult());
    const slots = p.missions.slots;
    if (index < 0 || index >= slots.length) return MetaResult.fail(c.res, MetaErrors.UnknownItem);
    const s = slots[index];
    if (!missionRewardAvailable(s)) return MetaResult.fail(c.res, s.rewardClaimed ? MetaErrors.AlreadyClaimed : MetaErrors.NotAvailable);
    s.rewardClaimed = true;
    this._grant(c, s.reward, 'Mission');
    return c.res;
  },
};
