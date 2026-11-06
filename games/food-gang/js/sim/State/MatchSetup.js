// MatchSetup / SlotSetup as plain objects with the C# defaults.
import { f } from '../Core/Vec2.js';
import { GoalType, TeamConfig } from '../Data/Enums.js';

/**
 * slot: game slot 0..3 (team and spawn point); team: 0 = derive from slot, else must equal it;
 * skinId: 1..16, 0 = random skin; level 1..20; botDifficulty 0..1.
 */
export function createSlotSetup(o = {}) {
  return {
    slot: o.slot ?? 0,
    team: o.team ?? 0,
    skinId: o.skinId ?? 1,
    level: o.level ?? 1,
    isBot: o.isBot ?? false,
    botDifficulty: f(o.botDifficulty ?? 0.5),
  };
}

/**
 * mapIndex: 0 Kitchen, 1 DiningRoom, 2 Pantry; isOffline: offline damage handicap vs bots;
 * startPlaying false = stay in WaitingToStart until Match.start.
 */
export function createMatchSetup(o = {}) {
  return {
    seed: o.seed ?? 1,
    mapIndex: o.mapIndex ?? 0,
    goal: o.goal ?? GoalType.DeathMatch,
    teams: o.teams ?? TeamConfig.FreeForAll,
    bossOnLeft: o.bossOnLeft ?? false,
    isOffline: o.isOffline ?? false,
    noTimer: o.noTimer ?? false,
    botDifficultyInt: o.botDifficultyInt ?? 50,
    botNoMove: o.botNoMove ?? false,
    botNoAction: o.botNoAction ?? false,
    startPlaying: o.startPlaying ?? true,
    slots: (o.slots ?? []).map(createSlotSetup),
  };
}

/** MatchSetup.AddSlot; returns the setup for chaining. */
export function addSlot(setup, slot, skinId, level, isBot, difficulty = 0.5) {
  setup.slots.push(createSlotSetup({ slot, skinId, level, isBot, botDifficulty: difficulty }));
  return setup;
}
