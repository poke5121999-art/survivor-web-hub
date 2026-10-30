// MetaService.Matchmaking.cs: offline match requests with bots.
import { TeamConfig, GoalType, SkinMode, MetaErrors } from './types.js';
import { Profile } from './profile.js';
import { ModeDef } from './db.js';
import { MetaResult, MatchRequestResult, MatchRequest, MatchSlot } from './events.js';
import { shuffle } from './fridge.js';

const RemapT1 = [2, 2, 3, 2];
const RemapT2 = [1, 3, 1, 1];
const RemapT3 = [3, 0, 0, 0];
const INT_MIN = -2147483648, INT_MAX = 2147483647;

/** Math.Round(x, MidpointRounding.ToEven) */
export function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** QuantumMatchmaker.ComputeSlotRemap (§12.5): permutation of 0..3, player slot = [0]. uint math. */
export function slotRemap(seed) {
  const x = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const a = x & 3;
  const u = Math.imul(x, 1664525) >>> 0;
  const A = RemapT1[a], B = RemapT2[a], C = RemapT3[a];
  const r = ((u + 1013904223) >>> 0) % 3;
  let v21, v23, v25;
  if (r === 0) { v21 = B; v23 = A; v25 = C; }
  else if (r === 2) { v21 = B; v23 = C; v25 = A; }
  else { v21 = A; v23 = C; v25 = B; }
  if ((u & 1) !== 0) { const t = v21; v21 = v23; v23 = t; }
  return [v21, v23, v25, a];
}

/** GameStateSystem.GetTeamForSlot. */
export function teamForSlot(slot, team, bossOnLeft) {
  switch (team) {
    case TeamConfig.TwoVersusTwo: return slot < 2 ? 1 : 2;
    case TeamConfig.OneVersusThree: return bossOnLeft ? (slot === 0 ? 1 : 2) : (slot === 3 ? 2 : 1);
    default: return slot + 1;
  }
}

export const matchmakingPart = {
  /**
   * Builds the next match (offline path, bots only). missionIndex >= 0 plays that weekly mission;
   * custom (CustomMatchOptions) is a custom room (no trophies, stars or difficulty change).
   */
  buildMatchRequest(p, utcNow, rng, missionIndex = -1, custom = null) {
    const db = this.db, fr = Math.fround;
    const res = new MatchRequestResult();
    const c = this._begin(p, utcNow, rng, res);
    let mission = null, missionDef = null;
    if (missionIndex >= 0) {
      const slots = p.missions.slots;
      if (!p.missions.unlocked || missionIndex >= slots.length) return MetaResult.fail(res, MetaErrors.MissionLocked);
      mission = slots[missionIndex];
      if (!this.isMissionUnlocked(mission, utcNow)) return MetaResult.fail(res, MetaErrors.MissionLocked);
      if (mission.completed) return MetaResult.fail(res, MetaErrors.AlreadyClaimed);
      missionDef = db.findMission(mission.missionId);
      if (missionDef === null) return MetaResult.fail(res, MetaErrors.UnknownItem);
    }

    custom = custom ?? null;
    const req = new MatchRequest({ missionIndex, isFriendRoom: custom !== null });
    this._pickMode(c, req, missionDef, custom);

    if (custom !== null && custom.mapIndex >= 0 && custom.mapIndex < db.maps.length) req.mapIndex = custom.mapIndex;
    else if (custom === null && p.gameCount <= 1) req.mapIndex = 0; // first real match: Kitchen
    else req.mapIndex = c.rng.range(0, db.maps.length);
    req.stageId = db.maps[req.mapIndex].stageId;

    req.seed = c.rng.range(INT_MIN, INT_MAX);
    req.bossOnLeft = c.rng.value < 0.5;
    req.localSlot = slotRemap(req.seed)[0];

    const playerSkin = p.skinSelected;
    const used = new Set();
    let botIdx = 0;
    for (let s = 0; s < 4; s++) {
      const slot = new MatchSlot({ slot: s, team: teamForSlot(s, req.team, req.bossOnLeft) });
      req.slots[s] = slot;
      if (s === req.localSlot) {
        slot.skinId = playerSkin;
        slot.level = Math.max(1, Profile.level(p, playerSkin));
        slot.name = p.name === null || p.name === '' ? 'Player' : p.name;
        continue;
      }
      slot.isBot = true;
      slot.skinId = custom !== null ? c.rng.range(1, db.skins.length + 1) : this._botSkin(c, botIdx, playerSkin, mission, missionDef);
      botIdx++;
      slot.botNameIndex = this._pickBotName(c, used);
      slot.name = slot.botNameIndex >= 0 ? db.botNames[slot.botNameIndex % db.botNames.length] : 'Bot';
    }

    let hostSkin = playerSkin;
    if (mission !== null && db.findSkin(p.missions.missionSkin) !== null) hostSkin = p.missions.missionSkin;
    req.hostLevel = Math.max(1, Profile.level(p, hostSkin));
    req.hostDifficulty = custom !== null ? fr(custom.difficultyInt / 100) : p.difficulty;
    req.botDifficultyInt = roundHalfEven(fr(Math.max(0, Math.min(1, req.hostDifficulty)) * 100));
    this._botLevelsAndAggros(c, req);
    res.request = req;
    return res;
  },

  /** DrawModeFromMission / DrawModeFromDeck priority (§12.3). */
  _pickMode(c, req, mission, custom) {
    const db = this.db;
    let mode;
    if (mission !== null) mode = mission.mode;
    else if (custom !== null && custom.modeIndex >= 0 && custom.modeIndex < db.randomModes.length) {
      mode = db.randomModes[custom.modeIndex];
      req.modeIndex = custom.modeIndex;
    } else if (c.p.gameCount < 2) mode = new ModeDef('mission.dm.2vs2', GoalType.DeathMatch, TeamConfig.TwoVersusTwo);
    else if (db.defaultMode.goal !== GoalType.Random || db.defaultMode.team !== TeamConfig.Random) mode = db.defaultMode;
    else if (db.randomModes.length === 0) mode = new ModeDef('', GoalType.DeathMatch, TeamConfig.FreeForAll);
    else {
      req.modeIndex = this._drawModeIndex(c);
      mode = db.randomModes[req.modeIndex];
    }
    req.goal = mode.goal > GoalType.KillBoss ? GoalType.DeathMatch : mode.goal;
    req.team = mode.team === TeamConfig.Random ? TeamConfig.FreeForAll : mode.team;
    req.modeText = mode.text;
  },

  /** Game.GameModeDeck: 2 cards per mode, Fisher-Yates shuffled, refilled when empty. */
  _drawModeIndex(c) {
    const deck = c.p.modeDeck;
    if (deck.length === 0) {
      for (let round = 0; round < 2; round++) for (let i = 0; i < this.db.randomModes.length; i++) deck.push(i);
      shuffle(c.rng, deck);
    }
    return deck.shift();
  },

  /** QuantumMatchmaker.GetMissionBotSkin (§12.6). */
  _botSkin(c, botIndex, playerSkin, mission, def) {
    if (def !== null) {
      const forced = mission.forcedSkins;
      if (def.skinMode === SkinMode.SameAsPlayer && c.p.missions.missionSkin > 0) return c.p.missions.missionSkin;
      if (def.skinMode === SkinMode.ForcedAllSame && forced.length > 0) return forced[0];
      if (def.skinMode === SkinMode.Forced && forced.length > 0) return forced[Math.min(botIndex, forced.length - 1)];
    }
    const n = this.db.skins.length;
    const r = c.rng.range(1, n + 1);
    return r === playerSkin ? (playerSkin % n) + 1 : r;
  },

  /** PickUniqueBotNameIndex: 20 tries for an unused name, then accept a repeat. */
  _pickBotName(c, used) {
    const n = this.db.botNames.length;
    if (n === 0) return -1;
    for (let i = 0; i < this.R.botNameTries; i++) {
      const k = c.rng.range(0, n);
      if (!used.has(k)) { used.add(k); return k; }
    }
    return c.rng.range(0, n);
  },

  _isAlly(req, slot) {
    switch (req.team) {
      case TeamConfig.TwoVersusTwo: return Math.trunc(slot / 2) === Math.trunc(req.localSlot / 2);
      case TeamConfig.OneVersusThree: {
        const boss = req.bossOnLeft ? 0 : 3;
        return req.localSlot !== boss && slot !== boss;
      }
      default: return false;
    }
  },

  /** ComputeBotLevelsAndAggros (§12.7): enemies +(6d-3), allies +(3-6d), noise -2..+2, clamp 1..20. */
  _botLevelsAndAggros(c, req) {
    const R = this.R, fr = Math.fround;
    const hd = req.hostDifficulty;
    const d = Math.min(hd, 1);
    const spread = R.botLevelSpread;
    const d2s = fr(fr(d * 2) * spread);
    const enemyOff = fr(d2s - spread);
    const allyOff = fr(spread - d2s);
    const allyAgg = fr((req.team === TeamConfig.TwoVersusTwo ? fr(0.5 - fr(0.5 * d)) : 0) + hd);
    const bossSlot = req.bossOnLeft ? 0 : 3;
    for (const s of req.slots) {
      if (!s.isBot) continue;
      s.isAlly = this._isAlly(req, s.slot);
      const off = fr((s.isAlly ? allyOff : enemyOff) + c.rng.range(R.botLevelNoiseMin, R.botLevelNoiseMaxExcl));
      const baseAgg = s.isAlly ? allyAgg : hd;
      const lvl = roundHalfEven(fr(req.hostLevel + off));
      s.level = Math.max(1, Math.min(R.maxSkinLevel, lvl));
      const r = c.rng.rangeFloat(R.botAggroBiasMin, R.botAggroBiasMax);
      const bias = req.goal === GoalType.KillBoss ? (s.slot === bossSlot ? -r : r)
        : req.goal === GoalType.LastSurvivor ? -r
          : req.goal === GoalType.Kill5 ? r : 0;
      const noise = c.rng.rangeFloat(-R.botAggroNoise, R.botAggroNoise);
      const aggro = Math.max(0, Math.min(1, fr(fr(noise + baseAgg) + fr(bias * hd))));
      s.botAggro = roundHalfEven(fr(aggro * 100));
    }
  },

  /** QuantumTutorialLauncher: Kitchen, FFA DeathMatch, player alone in slot 0 against 5 dummies. */
  buildTutorialRequest(p) {
    const req = new MatchRequest({
      goal: GoalType.DeathMatch, team: TeamConfig.FreeForAll, modeText: 'tuto', mapIndex: 0,
      stageId: this.db.maps[0].stageId, localSlot: 0, isTutorial: true,
      hostLevel: Math.max(1, Profile.level(p, p.skinSelected)), hostDifficulty: p.difficulty,
    });
    req.slots[0] = new MatchSlot({ slot: 0, team: 1, skinId: p.skinSelected, level: req.hostLevel, name: p.name });
    return req;
  },
};
