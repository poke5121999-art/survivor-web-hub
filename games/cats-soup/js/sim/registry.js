// Sim feature modules, in tick order. One module per system of the original game, each in js/sim/features/<id>.js:
//   export default {
//     id,                       // also the key of game.feat and of the module's state slice game.state[id]
//     data: ['<name>', ...],    // data/<name>.json files the module needs; boot puts them in game.data[name]
//     init(game),               // after fresh() and load(): create game.state[id] when missing (must be idempotent)
//     tick(game, dt),           // every frame, dt seconds of game time
//     offline(game, sec, raw, result),  // once after load: sec = capped seconds, raw = real seconds away,
//                               // result = {seconds, gold, energy} core paid
//     onEvent(game, e),         // every game.emit(type, data) (sell, build, upgrade, recipe, energy, jar, reward, ...)
//     rewards: { <type>: (game, value, extra) => given | null },  // reward types beyond 1-4 (specials.md)
//     ...actions                // plain functions taking game first, called by the view as game.feat[id].fn(game, ...)
//   }
// Rules stay pure: no DOM, no THREE, so node tests run the same code.
import specials from './features/specials.js';
import fishing from './features/fishing.js';
import missions from './features/missions.js';
import cats from './features/cats.js';
import equip from './features/equip.js';
import tower from './features/tower.js';
import furniture from './features/furniture.js';
import collection from './features/collection.js';
import shop from './features/shop.js';
import guide from './features/guide.js';
import theme from './features/theme.js';

export const FEATURES = [specials, fishing, missions, cats, equip, tower, furniture, collection, shop, guide, theme];
