// View feature modules, one per js/sim/features module with the same id. Each is
//   export default {
//     id,
//     mount(ctx),          // once after the HUD is built; bind HUD buttons, add DOM, load art
//     update(dt),          // every frame after the HUD update
//     onTap(work) -> bool, // a tapped facility; true = handled (the facility card does not open)
//     onEvent(e),          // every sim event of the frame
//   }
// ctx = { game, hud, ng, root, lang, view, scene, camera, sound, base, json(path), panel(name), css(href), t(key, ...args) }
//   hud.bind(path, fn) binds an NGUI button of art/ui/hud.json, hud.open(title, sub, tabs, draw) opens a list panel,
//   hud.toast(text), hud.sprite(atlas, name, cls); ng.build(node) turns an art/ui/panels/<name>.json node into DOM;
//   view.works.get(work.id).obj is a facility's 3D root, view.cats.get(cat.id) its cat ({obj, rig}).
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

export const VIEWS = [specials, fishing, missions, cats, equip, tower, furniture, collection, shop, guide, theme];
