# Farm Land (web remake, no Unity)

Browser remake of "Farm Land - Farming life game" (LolTap / Homa, `com.loltap.farmland` v3.28.12, Unity 6000.3.9f1 IL2CPP),
built the My Mini Mart way: original art and data extracted from the APK, rules read from the decompiled game code,
rebuilt on three.js r160 and plain ES modules. No build step.

- Run: open `index.html` (any static server). `?fresh` ignores the save, `?bot` lets the bot play, `?speed=N` fast-forwards.
- Portrait frame 750x1334 (Unity `defaultScreenOrientation` = Portrait), centred on wide windows.
- Worlds (WorldController.WorldDescs order): `regulier` (293 parcels), `japan` (299), `savana2` (300), `winter` (304); each has its own
  save `farmland-<world>-v1` (WorldSave: coins, parcels...), colours from its `ColorPreset` (Resources/colorschemes/WorldN.json applied
  through the FarmScene ColorPickerScript bindings) and `EconomyInflation` (1/5/10/15). `farmland-meta-v1` = { world, reached }.
  Travel: build the SectionFinal bridge, step into the Hydravion sphere (r 2.76) -> next world; the map button (Icon_Map) lists
  reached worlds (WorldGrassland/Asia/Savana/Iceland pictos). `?world=<id>` forces a world (dev).

## Layout

- `art/<world>/` world prefab: `scene.json` (node tree, TRS in three.js space, MonoBehaviour fields), `geo.glb` (unique meshes), `tex/`.
- `art/props/` loose prefabs (player, plants `<Crop>Plant_S/M`, drops, field cell, animals, tools).
- `art/ui/`, `art/sprites/` sprites cropped out of their atlases; `art/sfx/` original clips (mp3); `art/fonts/` Roboto-Bold (the game's UI font).
- `data/<world>.json` gameplay data (also `final` = SectionFinal bridge parcels + plane, `colors` = ColorPreset slots): crops (CropData + World._cropDataValues), parcels (grid, price, deps, neighbours, section),
  fields, barns (price lists), merchants, trees, animals, workers.
- `js/cloud.js` account save as in casual-farm: the hub's HubSave (`../../js/save-sync.js`, loaded with session.js,
  supabase-config.js, supabase-auth.js before main.js) under localStorage. Payload `{ v: 1, at, meta, worlds: { <world>: save } }`
  (game id `farmland`); `pull()` before the save is read (newer `meta.savedAt` wins; another account's local save is parked under
  `farmland-bak-<owner>` and the game starts fresh), `push()` at most every 20 s, forced on page hide and island change.
  Guests / no Supabase: every call is a no-op. Worst case (4 islands, all parcels open) ~19.6 KB of the 100 KB cap.
- `js/sim/meta.js` + `js/view/metaview.js` account layer (rules: `farmland-ref/rules/MONETIZATION.md`), saved in `meta.fs`:
  diamonds (HC, 30 at start), PetSpot (cat x1.25 sale coins / dog x1.3 barn collect; free 1 h trial once, then 50 HC for 5 h;
  pets follow with PetController numbers), BikeSpot (free 1 h trial once, then 50 HC for 5 h; x1.7 speed, HUD mount button,
  LT_Bike_* clips), piggy bank (+5 HC per parcel unlock, cap 600 + 150 x level, Ready above 360).
  Substitutions as in casual-farm [ĐỀ XUẤT]: no ads or real money on the web, so the piggy bank cracks for free once Ready
  and permanent IAP pets / bike / VIP / HC packs are left out. The bike stays upright at its prefab rest pose (the riding
  clips raise and pitch the pelvis it hangs from).
- Gacha skins: `art/skins` (33 of the 52 GC.HumanSkinsNames + BasePlayer; `data/skins.json` lists the pool and the 19 left
  out: lookalikes of licensed characters, brands or real people). Skins button -> SkinSelector: browse/wear owned skins,
  Unlock = HC `round5(min(300, 40 + 8 x owned))`, uniform among locked, worn at once, "New Character Unlocked!".
  `GameView.setSkin(id)` swaps the player body (own tools, bike, rig). Not in: the GachaRoot reveal diorama, worker skins.
- `js/sim/` rules without THREE (node-testable): `farm.js` (fields, parcels, merchants, trees, animals, barns, save),
  `workers.js` (barn workers), `path.js`, `bot.js`.
- `js/view/` three.js + DOM: `scene.js` (scene.json -> Object3D, SkinnedMesh, sprites), `shaders.js` (the game's custom shaders
  rebuilt from decoded GLSL), `world.js` (island; static transforms frozen), `game.js`, `fieldbatch.js` (one field = merged soil
  + InstancedMesh plants; only cells/kinds that changed are rewritten, one GPU upload per changed mesh per frame, soil colour
  skipped when unchanged), `anim.js` (humanoid clip player: blend tree + tool layer + state clips), `stage.js` (camera rig pitch 50 /
  distance 20 / fov 60), `input.js`, `sound.js`.
- `art/anim/animals.json` Generic clips of AC_Cow/Hen/Rooster/Pig/Elephant/Fox/Gazelle/Tortoise/Cat/Dog/Parrot/Goldfish/Sheep
  (`tools/export_generic.py`); `art/anim/plane.json` the seaplane trip RoadToNewWorld (with its camera tracks and events).
- `art/anim/stickman.json` player/worker/merchant clips as per-bone quaternions (from `tools/export_anim.py`).
- `tools/` regenerate everything from the extraction (paths point at the HDD copy `/run/media/bui-thanh-thuong/C0E02AC6E02AC310/farmland-ref`;
  run Python with `-I`, e.g. `~/unity-decode-kit/.venv/bin/python -I`):
  - `export_scene.py <out> <prefab...>` -> scene.json + geo.glb + tex (world: `art/regulier`; props: every `GameObject/*.prefab`).
  - `export_data.py regulier World_Regulier` -> `data/regulier.json` + crop icons.
  - `export_anim.py <LolTapStickmanAvatar.asset> art/anim/stickman.json Idle Walking Running_0 LT_Seeding Irrigate LT_Slash
    LT_Shaking StandingArmSpace Happy`: Mecanim muscles -> bone rotations with the Avatar's axes (see the file header).
  - `export_sprites.py regulier props`, `export_ui.py <SpriteName...>`, `export_audio.sh`.
  - `stamp.js <rev>` writes the import map with `?v=<rev>` on every module and `version.json`. Run it on every release.

## Rules (source: `farmland-ref/rules/RULES.md`, cited `File.c:line` of the decompile)

- Field 5x5 cells, Seed -> Water -> Harvest -> Seed; a touched cell advances after `Crop.Timers[state]` s (original 0.5/0.5/0.1,
  see the planting note below for the remake's faster values); fewer than N cells left in Seed/Water finish themselves; harvest drops `Random(Min..Max)` items, each lands in the bag after 0.2 s.
- Player speed 7; tool = field state (seed bag, watering can, scythe), tool box 1.2 ahead.
  **Planting is deliberately faster and smoother than the original (user feel-test, rev 20261101f): sow and water while
  walking.** Original -> remake: field slow-down x0.4 -> x0.95, only while a workable cell is in the tool box, eased over
  0.15 s; Seed/Water cell timer 0.5 s -> 0.05 s (player only, workers keep 0.5 s); seed box 0.7 -> 2.2, water 0.9 -> 2.2;
  auto-complete below 4 -> below 13 cells left. One straight pass sows and waters a whole 5x5 field (~0.7 s). Harvest keeps the
  original scythe (sphere 1.75, 0.1 s); new growBeat: a freshly watered field can be cut after 1.2 s, so the same pass does not
  cut what it just grew. Field and tool shaders are compiled at load (warm frames) so the first sowing does not hitch.
- Parcel: on offer when its dependencies are open; stand at its edge to donate `price*dt/4` per frame (x3.5 every 2 s);
  wallet persists; unlocking adds a land point and raises the level (price) of the parcel's crop.
- Merchant: sells one crop type per frame, `(98*clamp01(count/500)+2)` items; price `DropValue + LevelExtraValue*(level-1)`.
- Barn: capacity 100..10000 over 100 levels; workers (hire/upgrade from the barn popup) plant/water/harvest the section's fields,
  carry 50 to the barn; walking into the barn moves its stock to the bag.
- Trees regrow in real time (`DropGenericTime`), shake when > 4 fruits; animals ready `DropGenericTime` after the last collect.
- Start: 7 coins (first frame of a fresh game in clip `buyciZObYbc`).

## Tests

- `node test/farmland-sim.js` (FL_MINUTES, FL_SEED, FL_WORLD): bot plays the real data without a browser.
- `node test/farmland-play.js`: headless Chromium drives the page (load, ?v=, animated walk, buy, field cycle, sell, barn popup,
  worker skin, reload, frame, perf guard: all parcels open + every field grown < 3000 matrix updates and < 400 draw calls,
  seaplane to Japan and back through the map button).
- `node test/farmland-meta.js`: account-layer rules and their effect on a real Farm (cat sale, dog barn, bike speed).
- `node test/farmland-cloud.js`: fake HubSave rows in the test process; upload, restore on a second device, upload before an
  island change, newer-wins, other account parks the save, payload size.
- `node test/skinshot.js`: every skin worn and walking (shots/skins-sheet*.png). `node test/animalshot.js`, `node test/flightshot.js`.
- `node test/animshot.js`: close-up renders of every player clip (shots/anim/, contact sheet via PIL).

## Known gaps

- Humanoid retarget skips Mecanim's twist distribution (ArmTwist/LegTwist 0.5) and IK goals; on the stickman this is not visible.
- Minigames (shake the tree, milk the cow, shear the sheep, fishing) are replaced by walking up / standing near.
- Not in: boat, rain, Super Farmer (RV golden tools), shop / HC packs / VIP / starter pack (real money), free chest, parrot (VIP).
- Start coins of islands 2-4 = 7 like Regulier (inferred; WorldSave starts empty and the clip only shows Regulier).
