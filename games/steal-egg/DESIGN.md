# Steal An Egg (web) - design

Plain ES modules, no build step, three.js r160 from `vendor/`. Landscape like the original (Unity allows only
landscape). The page fills the window; on a phone held in portrait the stage is rotated 90 degrees by CSS so the
game still plays landscape. UI sizes follow the original CanvasScaler: reference 1920x1080, ScaleWithScreenSize,
match 0.5 (scale = sqrt((w/1920)*(h/1080)) in log space, i.e. 2^((log2(w/1920)+log2(h/1080))/2)).

## Layers
- `js/sim/` pure rules, no THREE, runs in node. Fixed step 1/30 s. Emits events into `sim.events` (array of
  `{type, ...}`), the view reads and clears them. Same rules for the player and the AI rivals (bots).
- `js/view/` three.js scene, rigs, camera, DOM HUD, sound. Reads sim state, never writes it except through
  `sim.input(...)` / `sim.action(...)`.
- `js/main.js` boot: loading blur, loads art, creates sim + view, drives the loop, save/load. The game starts on the
  16 px textures and the HUD sprites of everything that can appear without a tap; full textures and menu sprites stream
  in afterwards.
- `js/view/panels.js` the Drop 2 panels (shop, bat/shoes shops, pedestals, inventory, settings, pause, ads break).

## Sim state (plain JSON, saved to localStorage key `steal-egg-v1`)
```
{
  t,                          // sim seconds
  coins,                      // int
  actors: [                   // index 0 = player, 1..3 = rivals AI_01..AI_03 (+ guard if the 4th EnemyAI is one)
    { id, kind: 'player'|'rival', pos:[x,y,z], yaw, hp, stunUntil, speed,
      carry: null | { item },  // item id
      brain: {...}             // rivals only: EnemyAI state machine fields
    } ],
  items: {                    // every egg and brainrot has exactly ONE location (no duplicated lists)
    <id>: { kind: 'egg'|'brainrot', eggType?, seed?, at: Loc, readyAt? } },
  // Loc = {nest: animalIdx, slot} | {ground: [x,y,z]} | {carried: actorIdx} | {stowed: actorIdx}
  //     | {farm: farmIdx, pos:[x,y,z]}            farmIdx 0 = player farm, 1..3 = rival farms
  animals: [ { state: 'sleep'|'chase'|'return'|..., pos, target, respawnAt } ],
  farms: [ { level, gate: { closedUntil } } ],
  upgrades: { speedPlans, savedSpeed, weapons:{unlocked, ads, equipped, changed}, cosmetics:{unlocked, picked} },
  tutorial: { ... }, settings: { sound, music, sensitivity },   // no vibration setting in the original
  adsBreak: { left, acc, interstitialNext, reward, panel, loading, loadAcc }   // session only, reset by startSession
}
```
Numbers come from `data/*.json` written by `tools/export_data.py` from the APK dumps, never typed in by hand.
Every rule cites `rules/<system>.md`.

## Coordinates
Unity (x,y,z) -> three (x,y,-z) once in the exporter. The sim works in three.js world coordinates in metres.
