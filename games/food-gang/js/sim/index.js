// FG.Sim for the browser and node: plain ES modules, no dependencies.
//   const db = GameDb.load(await (await fetch('data/simdata.json')).text());
//   const match = new Match(db);
//   const setup = createMatchSetup({ seed: 42, mapIndex: 0, goal: GoalType.DeathMatch, teams: TeamConfig.TwoVersusTwo });
//   addSlot(setup, 0, 1, 10, false); addSlot(setup, 1, 6, 10, true, 0.5); ...
//   const state = match.create(setup);
//   each tick: match.step(state, [InputFrame.make(dirX, down), ...]); match.drainEvents() for the view
export { f, Vec2, SMath, DEG2RAD } from './Core/Vec2.js';
export { sinf, cosf, fma } from './Core/CrtMath.js';
export { SimRng } from './Core/SimRng.js';
export { dotnetSort } from './Core/DotnetSort.js';
export * from './Data/Enums.js';
export { GameDb } from './Data/GameDb.js';
export { InputFrame } from './State/InputFrame.js';
export { createMatchSetup, createSlotSetup, addSlot } from './State/MatchSetup.js';
export {
  createMatchState, createAgentState, createBotState, createBulletState, cloneMatchState, agentInSlot,
  elapsed, has, isDead, hpRatio, hasPower, power,
} from './State/MatchState.js';
export { SimEventType, SIM_EVENT_TYPE_COUNT, createSimEvent } from './State/SimEvent.js';
export { GameRules, SimConst, EndRule, TimeOutRule } from './Systems/GameRules.js';
export { Physics2D } from './Systems/Physics2D.js';
export { ActionSystem } from './Systems/ActionSystem.js';
export { LifeSystem } from './Systems/LifeSystem.js';
export { BotBrain } from './Bot/BotBrain.js';
export { Match, Ctx } from './Match.js';
