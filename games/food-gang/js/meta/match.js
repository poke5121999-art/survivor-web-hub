// MetaService.Match.cs: match results and the tutorial.
import { TeamConfig, Victory, GoalType } from './types.js';
import { MetaResult, MatchResult, FridgeEarned } from './events.js';

/** GameController.StarForRank: rank 1 -> 3, 2 -> 2, anything else -> 1. */
export const starForRank = rank => (rank >= 1 && rank <= 3 ? 4 - rank : 1);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const matchPart = {
  /** GameController.TrophyForResult: FFA by rank; team win 5, draw/quit 2, loss 1. */
  trophyForResult(team, rank) {
    if (team === TeamConfig.FreeForAll) return this.db.trophyForRank(rank);
    const t = this.db.trophiesPerRank;
    return rank === 1 ? t[0] : rank === 0 ? t[2] : t[3];
  },

  /**
   * QuantumGameStartSequence.BuildAndInjectResults + GameOver.Start (§5.3, §5.7): trophies,
   * difficulty, stars, stats, mission progress, and the fridge offered on the result screen.
   */
  applyMatchResult(p, req, o, utcNow, rng) {
    if (!req) throw new Error('req is null');
    if (!o) throw new Error('outcome is null');
    const R = this.R;
    const res = new MatchResult();
    const c = this._begin(p, utcNow, rng, res);
    this._refillStock(c);

    const ffa = req.team === TeamConfig.FreeForAll;
    const mission = req.isMission;
    const friend = req.isFriendRoom;

    let rank, victory;
    if (ffa) {
      rank = clamp(o.rank, 1, 4);
      victory = rank === 1 ? Victory.Victory : rank === 4 ? Victory.Defeat : Victory.Draw;
    } else {
      const winner = o.quitEarly ? 0 : o.winnerTeam;
      rank = winner < 1 ? 0 : req.player.team === winner ? 1 : 4;
      victory = rank === 1 ? Victory.Victory : rank === 4 ? Victory.Defeat : Victory.Draw;
    }
    if (mission && victory !== Victory.Victory) victory = Victory.Defeat;
    res.rank = rank;
    res.victory = victory;

    const gameCount = p.gameCount;
    if (gameCount > 0 && !mission && !friend) {
      res.trophiesGained = this.trophyForResult(req.team, rank);
      this._addTrophies(c, res.trophiesGained);
    }

    res.difficultyBefore = p.difficulty;
    if (gameCount > 0 && !friend) {
      if (ffa) this._difficultyFromRank(c, rank);
      else this._difficultyFromVictory(c, victory);
    }
    res.difficultyAfter = p.difficulty;

    const starStart = clamp(p.fridge.stars, 0, 10);
    const stars = starForRank(rank);
    if (!mission && !friend) this._addStars(c, stars);
    const starEnd = friend ? 0 : clamp(starStart + stars, 0, 10);
    res.starsGained = stars;
    res.starStart = Math.min(starStart, R.maxStar);
    res.starEnd = Math.min(starEnd, R.maxStar);

    const st = p.stats;
    st.kills += o.kills;
    st.deaths += o.deaths;
    st.jumps += o.jumps;
    if (gameCount !== 0) {
      if (rank === 1) st.wins++; else st.losses++;
    } else this._unlockAchievement(c, 'TUTO_COMPLETED');
    if (rank === 1 && o.deaths === 0) this._unlockAchievement(c, 'NO_DEATH');
    if (o.kills >= R.carnageKills) this._unlockAchievement(c, 'CARNAGE');
    else if (rank === 1 && o.kills === 0 && req.goal !== GoalType.KillBoss) this._unlockAchievement(c, 'ZERO_KILL');
    if (o.specialKill) this._unlockAchievement(c, 'SPECIAL_KILL');

    p.gameCount++;
    st.battles++;
    if (!p.tutorialDone) p.tutorialDone = true;

    if (mission && rank === 1) res.missionCompleted = this._progressMission(c, req.missionIndex);

    this._resolveResultFridge(c, res, mission, friend);
    this._checkAchievements(c);
    return res;
  },

  /** GameOver.Start: the fridge block and which fridge it offers. */
  _resolveResultFridge(c, res, mission, friend) {
    const f = c.p.fridge, R = this.R;
    f.pendingBox = 0;
    if (mission || friend) return;
    res.rewardPanel = c.p.gameCount >= 2 && (f.stock >= 1 || f.unlocked > 0);
    const hasBox = f.unlocked > 0 && res.starEnd === R.maxStar;
    if (!hasBox) {
      f.unlocked = 0;
      return;
    }
    if (!res.rewardPanel) return;
    const box = this._nextFridgeBox(c);
    f.pendingBox = box;
    res.fridgeBox = box;
    res.canOpenFree = c.vip || f.openCount < R.freeFridgeOpens;
    res.canOpenAdOrGems = !res.canOpenFree;
    res.fridgeGemPrice = this.db.gameOverBoxPremiumPrice;
    c.res.events.push(new FridgeEarned(box));
  },

  /** QuantumGameStartSequence.FinalizeTutorial: game count 0 -> 1, no rewards. */
  completeTutorial(p, utcNow) {
    const c = this._begin(p, utcNow, null, new MetaResult());
    if (p.tutorialDone) return c.res;
    p.gameCount++;
    p.stats.battles++;
    p.tutorialDone = true;
    this._unlockAchievement(c, 'TUTO_COMPLETED');
    this._checkAchievements(c);
    return c.res;
  },
};
