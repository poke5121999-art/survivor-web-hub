// View feature modules, one per js/sim/features module with the same id. Each is
//   export default {
//     id,
//     mount(ctx),          // once after the HUD is built; bind HUD buttons, add DOM, load art
//     update(dt),          // every frame after the HUD update
//     onTapAt(x, y) -> bool, // any tap on the 3D view (client pixels) before facility picking; true = handled
//     onTap(work) -> bool, // a tapped facility; true = handled (the facility card does not open)
//     onEvent(e),          // every sim event of the frame
//     onWork(entry),       // a facility's 3D object was created ({obj, anchor, w}); also called for those built before mount
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
import kitty from './features/kitty.js';
import telescope from './features/telescope.js';
import minigame from './features/minigame.js';
import season from './features/season.js';
import profile from './features/profile.js';
import guests from './features/guests.js';
import particles from './features/particles.js';

export const VIEWS = [specials, fishing, missions, cats, equip, tower, furniture, collection, shop, guide, theme, kitty, telescope, minigame, season, profile, guests, particles];
