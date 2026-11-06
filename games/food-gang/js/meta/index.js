// FG.Meta for the web: Food Gang meta rules, a one-to-one port of the C# library
// (D:\foodgang-ref\fg-unity\Assets\FG\Meta). Browser and node, no dependencies.
//
//   import { MetaDb, MetaService, MetaRng, ProfileJson, LocalStorageProfileStore } from './meta/index.js';
//   const db = MetaDb.load(await (await fetch('data/metadata.json')).text());
//   const meta = new MetaService(db);
//   const store = new LocalStorageProfileStore();
//   const rng = new MetaRng(Date.now());
//   const p = ProfileJson.load(store) ?? meta.newProfile(new Date(), rng);
//   meta.tick(p, new Date(), rng);
//   ProfileJson.save(store, p);
export { MetaRng, MetaTime } from './rng.js';
export { formatFloat, FormatError } from './json.js';
export {
  RewardType, Currency, Rarity, PriceType, GoalType, TeamConfig, SkinMode, Victory, FridgeOpenMethod, AdPlacement,
  DailyGiftSlot, ShopGroup, RoadStepState, IapKind, Reward, reward, MetaErrors,
} from './types.js';
export {
  MetaDb, SkinDef, LevelCost, PowerDef, LeagueRow, ModeDef, MissionDef, ShopItemDef, LeaguePackDef, MapDef, BoxSpec,
  AchievementDef,
} from './db.js';
export {
  Profile, ProfileJson, CurrentVersion, createProfile, newSkinProgress, missionRewardAvailable,
  MemoryProfileStore, LocalStorageProfileStore,
} from './profile.js';
export * from './events.js';
export { MetaService } from './service.js';
