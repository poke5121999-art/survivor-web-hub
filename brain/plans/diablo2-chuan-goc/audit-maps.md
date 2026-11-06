# Audit: how areas link — Diablo II remake vs original (D2 1.x / D2R 3.1 data)

Scratchpad = `C:\Users\tamph\AppData\Local\Temp\claude\D--survivor-web-hub\ebf62535-5282-4ff4-b4c2-aa7e3cae04d7\scratchpad`.
Tags: **[measured]** = I ran or read it in this session; **[docs]** = from a cited source; **[guess]** = memory or inference, not checked.
Read-only audit: no repo file was changed. Scripts and screenshots are in the scratchpad (`links_diff.js`, `sides.js`, `ts.js`, `observe.js`, `shots-maps/`, `ref/` = D2MOO sources + extracted data guide).

## A. How original D2 links levels

Sources I read:
- D2MOO (ThePhrozenKeep's reverse-engineered D2Common), downloaded to `ref/`: `DrlgOutPlace.cpp`, `DrlgOutdoors.cpp`, `DrlgOutRoom.cpp`, `DrlgOutSiege.cpp`, `DrlgActivate.cpp`
  (https://raw.githubusercontent.com/ThePhrozenKeep/D2MOO/master/source/D2Common/src/Drlg/<file>).
- `D:\d2r-ref\fs\data\data\global\excel\levels.txt`, `lvlwarp.txt`, `lvlprest.txt`, and `_diabloiidatafileguide.mht` (extracted to `ref/guide.txt`).
- OpenDiablo2 `d2core/d2map/d2mapgen/act1_overworld.go`.

1. **One coordinate space per act.** [docs: D2MOO `DRLGOUTPLACE_CreateLevelConnections`, DrlgOutPlace.cpp:1446-1530]. Each level gets a world rectangle `pLevelCoords` in tiles. Outdoor levels sit edge to edge in that space. Cave and dungeon levels get far-away offsets (levels.txt `OffsetX/Y`, e.g. Den of Evil at 1500,1000) and are reached only by warps.
2. **Placing the outdoor chain** (`sub_6FD823C0`, :1735). For each act, a table `gAct*DrlgLink` lists levels and the parent each one attaches to (:29-113). A linker function picks a random direction:
   - `sub_6FD81430`, :1026: 0 = +y, 1 = -x, 2 = -y, 3 = +x, with a ±16 or 8 tile jog.
   - A placement that overlaps an earlier level is rejected and the generator backtracks (`DRLG_CheckNotOverlappingUsingManhattanDistance`).
   - The DRLG then registers each pair as a Vis entry with **warp id -1** (`DRLG_SetWarpId(..., -1)`, :1860-1872). warp -1 means a walking link.
   - `sub_6FD826D0` (:1875) also links *any* two levels in a range whose rectangles touch (used for Act III and Act V).
   - `sub_6FD82750` (:1896) adds an "orth" (adjacent-room) record for every Vis whose warp is -1, with the side computed from the two rectangles.
   - Per-act specifics:
     - **Act I**: two separate groups. Group 1: Stony Field at its levels.txt offset, then Cold Plains, Blood Moor, Rogue Encampment and Burial Grounds, each attached to the previous level in a random direction. Blood Moor's size is rolled as 56x96 or 96x56 (`sub_6FD81950`). Group 2: Monastery Gate at its offset, then Tamoe Highland (always +y, `sub_6FD81AD0`), Black Marsh and Dark Wood. **Nothing walks from Stony Field to Dark Wood.** The only route is the Underground Passage warp (levels.txt Cave 3 has Vis0 = Stony Field and Vis1 = Dark Wood).
     - **Act II**: Rocky Waste is placed only -x or -y of Lut Gholein (`sub_6FD81B30`). The other desert levels use 8 possible placements each (`sub_6FD81530`, `sub_6FD815E0`). **Canyon of the Magi is its own group** at offset 2500,1000 with no Vis entries, so it is reached by the Arcane Sanctuary portal or a waypoint, never on foot.
     - **Act III**: three 64x192 jungle blocks are attached as a random tree, sorted by y and then named Spider Forest, Great Marsh and Flayer Jungle (`DRLG_GenerateJungles`, :2414). Lower Kurast through Travincal are stacked to the -y side, centred. Touching pairs are all linked, so Spider Forest can touch Flayer Jungle directly and the Great Marsh becomes a side branch. [docs for the code; that this is common in play is a guess]
     - **Act IV**: Outer Steppes is always on the +x side of the Fortress (`sub_6FD81CA0`, direction 3). Plains of Despair and City of the Damned are placed at random. City to River of Flame is a warp. River of Flame to Chaos Sanctuary is a walking link (River's Vis1 = 108, Warp -1).
     - **Act V**: Bloody Foothills is fixed at x 760..1000, i.e. **on the -x side of Harrogath** (Harrogath is at 1000,1000). Its strip runs from "Siege To Town" at the **east (+x) end** to "To Barricade" at the west end (`DrlgOutSiege.cpp`:73-87). Frigid Highlands is placed further -x (`DRLGOUTROOM_LinkLevelsByLevelCoords`) as a 64x160 or 160x64 level, with "Barricade To Siege" in its +x/+y corner (:476-495). Arreat Plateau comes from a fixed offset table. Frozen Tundra is a separate group reached by warps.
   - Presets placed with `Depend` + `OffsetX/Y` are also walking links: Outer Cloister (dep Monastery Gate, offset 0,-40) and Cathedral (dep Inner Cloister, offset -4,-34) [docs: levels.txt + guide "Depend"].
3. **The joining strip.** [docs: DrlgOutPlace.cpp:687-860, DrlgOutdoors.cpp:22-84]
   - The border is laid along the level's outline polygon, one border stamp per 8x8-tile grid cell, picked by edge direction and act.
   - A polygon vertex with flag 1 marks an edge shared with a neighbour level. On that edge the cell **at the middle of the shared segment** gets the `bLvlLink` flag and a different picked file of the border preset (file 3, or 4 for Burial Grounds). That file is the opening.
   - Both levels derive the opening from the same world rectangles, so the openings line up exactly.
   - Act I also lays dirt paths from fixed town-gate points (town +59,+19 / +29,+35 / +4,+22 / +29,+3 by direction) and from the Monastery Gate to the exits (`DRLGOUTDOORS_SpawnAct1DirtPaths`, DrlgOutdoors.cpp:999).
4. **Crossing.**
   - Outdoor rooms are 8x8 tiles. The client streams the room it stands in plus its `ppRoomsNear`, and orth links make rooms of the adjacent level count as "near" (`DRLGACTIVATE_*`, DrlgActivate.cpp:85-260) [docs].
   - So walking across a level edge is plain movement in shared coordinates: no teleport and no loading screen. The neighbour's terrain is drawn across the gap. Monsters chasing you keep chasing. The automap shows both levels contiguously, and the area name in the corner changes. [the player-facing details are guess/memory, but consistent with the room code]
   - OpenDiablo2 does the same for town + Blood Moor: one 150x150 map, town stamp and wilderness stamps placed side by side (`act1_overworld.go`:37-90) [measured, read].
5. **Warps** [docs: lvlwarp.txt + guide §LvlWarp].
   - A warp is a set of special tiles inside a DS1 stamp.
   - `SelectX/Y/DX/DY` give the clickable pixel box. With `LitVersion` = 1 and `Tiles`, a highlighted tile set is shown on mouse-over.
   - `NoInteract` = 1 means it cannot be clicked and triggers by walking onto it: Act II sewer trapdoors (19, 50), Kurast temple doors (61), Travincal to Durance (64), Mountain Top (79, 80).
   - On arrival the player is placed at `OffsetX/Y` subtiles from the matching warp on the other side, then walks `ExitWalkX/Y` out (e.g. Cave Up: offset 2,5, walk 3,5).
   - Warps load a different level group, which shows a brief loading screen. Waypoints and town portals do too. [loading-screen detail is a guess]
6. **Portals** are objects, not levels.txt links: Cairn Stones to Tristram, cow portal, Palace Cellar 3 to Arcane Sanctuary, Arcane to Canyon, the Orifice to Duriel, Durance 3 to Fortress, Anya's portal, the Act V red portals, uber portals.

## B. Link table (all 5 acts)

Truth: levels.txt Vis/Warp (warp ≥ 0 = warp, -1 = walk), plus the D2MOO chains (walk), plus known portal objects. Compared with the remake's `D2DATA.areas[*].links` and `D2G.linksOf(...).walk/warp/portal`, using `links_diff.js` [measured]. Result: **141 pairs, 135 identical.** Differences are marked **≠**.

**Walking links: who is on which side in D2** (D2 axis: -y = screen up-right, +x = screen down-right). "Remake side" was measured with `sides.js` over 400 seeds.

| Act | Pair | D2 placement | Remake side of B seen from A | Note |
|---|---|---|---|---|
| I | Rogue Enc. – Blood Moor | random, table-checked (`dword_6FDD05C0`) | n/e/s/w ~25% each | ≠ inconsistent between the two ends (C.2) |
| I | Blood Moor – Cold Plains | random 0-3 | random | ≠ same |
| I | Cold Plains – Stony Field | random 0-3 | random | ≠ same |
| I | Cold Plains – Burial Grounds | random, not the same side as Blood Moor | random | ≠ same |
| I | Tamoe – Monastery Gate | Tamoe always +y of the Gate | 74% n, 26% s/w/e | ≠ 24% wrong even with one shared seed |
| I | Black Marsh – Tamoe, Dark Wood – Black Marsh | random | random | ≠ inconsistent |
| I | Monastery Gate – Outer Cloister (Depend), Outer Cloister – Barracks (door), Inner Cloister – Cathedral (Depend) | fixed | FIXED map; barracks side follows the court variant | ok |
| I | **Stony Field – Dark Wood** | **no link (Underground Passage warp)** | walk | **≠ wrong link** (`build_data.py`:199) |
| II | Lut Gholein – Rocky Waste | -x or -y of the town | w / n 50/50 | ok rule, ≠ 51% inconsistent |
| II | Rocky Waste – Dry Hills – Far Oasis – Lost City – Valley of Snakes | random, 8 placements | random | ≠ inconsistent |
| II | **Valley of Snakes – Canyon of the Magi** | **no link (Canyon is its own group)** | walk | **≠ wrong link** (`build_data.py`:205). Lets you walk past the Summoner |
| III | Docks – Spider Forest – Great Marsh – Flayer Jungle – Lower Kurast – Bazaar – Upper Kurast – Causeway – Travincal | jungle tree, then Kurast stacked -y | all 'n' | ok direction. ≠ missing the occasional Spider Forest – Flayer Jungle walk |
| IV | Fortress – Outer Steppes | always +x | 'e' | ok |
| IV | Steppes – Plains – City | random | random | ≠ 44-63% inconsistent |
| IV | River of Flame – Chaos Sanctuary | walk across the bridge | walk (MAZE_WALK) | ok |
| V | Harrogath – Bloody Foothills | Foothills on -x of the town; town at Foothills' +x end | town→Foothills 'w'; Foothills→town **'w'** | **≠ 100% mismatch: mirrored strip** (`drlg.js`:447, :1152) |
| V | Foothills – Frigid Highlands | Frigid on -x | 'e' | ≠ mirrored |
| V | Frigid – Arreat Plateau | offset table | random | ≠ 43% inconsistent |

**Warps**: every levels.txt warp pair in all acts matches the remake's kind (warp vs walk) [measured; 89 warp rows].
- Act I (26): Den of Evil; Cave 1-2; Underground Passage 1-2 (from Stony Field **and** Dark Wood); Hole 1-2; Pit 1-2; Tower and Tower Cellar 1-5; Crypt and Mausoleum; Barracks to Jail 1; Jail 1-3 to Inner Cloister; Cathedral to Catacombs 1-4.
- Act II (26): Sewers 1-3; Harem; Palace Cellar 1-3; Stony Tomb; Halls of the Dead; Claw Viper Temple; Maggot Lair; Ancient Tunnels; 7 Tal Rasha tombs.
- Act III (20): Arachnid Lair, Spider Cavern, Swampy Pit, Flayer Dungeon, Kurast Sewers, 6 temples, Durance 1-3.
- Act IV (1): City of the Damned to River of Flame.
- Act V (16): Crystalline Passage, Frozen River, Glacial Trail, Drifter Cavern, Frozen Tundra, Ancients' Way, Icy Cellar, Arreat Summit, Worldstone Keep 1-3, Throne, Chamber, Nihlathak's halls.

**Portals**: all present (Tristram, cow, Arcane in/out, the Orifice ×7, Durance to Fortress, Anya, 3 red portals). The extra Harrogath uber portals (Matron's Den, Forgotten Sands, Furnace, Tristram A5) are real cube portals: ok.

## C. Remake mechanism today (file:line) and what was observed

1. **Every crossing is a teleport plus a full rebuild with a fresh random seed** [measured, read].
   - `checkExits` (`game.js`:1270-1283) runs only inside `moveHero` (:1237). It fires when the hero is within **2.8 subtiles** of any exit point, at least 1.5 s after arrival.
   - It then calls `enterArea(to, from)`, which picks `seed = random` (:399, except when a corpse is there), shows the "Đang vào X..." overlay (:398), and calls `D2G.build` (:405).
   - On arrival, `S.ents = []` drops all monsters and followers except the merc respawn (:411), and `g.seen` is a new automap (:409).
2. **Edge sides are rolled per seed, not per act** [measured].
   - `sideLayout(seed)` (`drlg.js`:455-507) walks the links from the town and picks sides at random (`rng.f() < 0.4` at :487). FIXED (:431-448) covers only a few areas.
   - The level you leave and the level you enter use **different seeds**, so their layouts disagree. `sides.js`: Act I walking pairs land on a non-opposite edge in **72-78%** of crossings, Act II 51-74%, Act IV/V 43-63%. Harrogath–Foothills is wrong **100%** of the time, even with one seed.
   - Observed run 1 (log in this session): town **S** edge → Blood Moor **S** edge; Blood Moor **N** → Cold Plains **W**; Cold Plains **W** → Blood Moor **E**, a new layout.
   - Run 2 (`shots-maps/observe-log.txt`): town **W** → Blood Moor **S**; Blood Moor N → Cold Plains S (correct by chance); Cold Plains S → Blood Moor **E**.
3. **Gap position is random on each side.** `k = 2 + rng.int(...)` (`drlg.js`:1307) puts the opening at a random border cell on each level independently, and the exit is the walkable edge cell inside that band (:1402-1407).
   - The arrival spot is `openCellNear(exit, 12)` (`game.js`:415, :446-460): measured **7.7-15.7 subtiles** inside the edge.
   - In D2 the opening is at the middle of the shared segment and the player simply keeps walking.
4. **The opening leads to black void** [measured].
   - `shots-maps/b-bloodmoor-to-coldplains-2-before-wide.png`: a gap in the tree border, black beyond it. Nothing of Cold Plains is drawn.
   - `a-town-to-bloodmoor-5-after-wide.png`: hero arrives at the very south edge of Blood Moor, and half the screen is void where the camp should be.
   - No dirt paths join gates and exits (no "dirt/road" code in `drlg.js`).
5. **Re-entering regenerates the level** [measured]. Blood Moor seed 338928731 → 523813069:
   - den moved (117,297) → (112,312);
   - town exit moved from the S edge to the W edge (0,247);
   - Cold Plains exit moved N → E.
6. **Loading overlay on walking crossings** [measured]: "Đang vào …" is shown for 0.04-0.09 s per crossing with assets cached (MutationObserver on `UI.loadEl`). The area name only appears via `UI.msg` on town load (`game.js`:1583) and in the automap header (`ui.js`:643).
7. **Warps** [measured]:
   - They are not clickable or highlighted. `d-den-entrance-hover.png` shows the mouse on the Den of Evil mouth with `S.hover` = null: no lit tiles, no label.
   - Walking within 2.8 subtiles triggers them, including warps that D2 marks interactive.
   - Arrival is 12.5 subtiles from the up-stairs (`d-den-arrival.png`), not at lvlwarp `OffsetX/Y` + `ExitWalk`.
   - `warpExits` (`drlg.js`:514-528) clusters the DS1 warp tiles by style, which is correct for Vis/Warp mapping.
8. **Data errors**: `HAND_LINKS` in `_tools/build_data.py`:196-226 types `('stony_field','dark_wood')` and `('valley_of_snakes','canyon_of_the_magi')` as walking links. Everything else typed there agrees with D2MOO.
9. **Smaller differences**:
   - Blood Moor is always 80x80; D2 rolls 56x96 or 96x56 (D2MOO :1340).
   - The town DS1 variant is picked independently of the exit side for Acts II-V (`townVariant(seed)`, `drlg.js`:451). In D2 the direction rolled for the link sets `pPreset->nDirection` (:1819-1829).
   - Tilesets differ across some walking links: act1mon, act2town vs act2desert, act3town / jungle / kurast, act4town vs mesa, act5town / siege / barricade (`ts.js`). A stitched renderer must handle more than one tileset.

## D. Gaps, ranked by what a player notices most

1. **The neighbour is on the wrong side and the map spins.** [measured]
   - Evidence: C.2, C.3.
   - Fix: one **act layout seed** stored in `S.char.actSeeds[diff][act]` (new character / new game = new seed). Every `sideOf` / `buildOutdoor` / `townVariant` call for that act uses it. Each level's build seed = `hash(actSeed, areaId)`, so a re-entry gives the same level.
   - Replace `sideLayout` with a port of D2's placement:
     - data shape: `ACT_LINKS[act] = [{ id, parent, linker: 'rand4'|'town'|'act2town'|'south'|'east'|'west', size?: [[56,96],[96,56]] }]` plus a fixed `{ x, y }` from levels.txt `OffsetX/Y` for chain roots;
     - the output is a world rectangle per level, and side = direction between rectangles.
   - Put the opening at the middle of the shared segment (world coordinates), on both sides.
   - Arrive at the matching world point: hero position = exit point + 2-3 subtiles inward along the edge normal, keeping the offset *along* the edge.
   - Files: `drlg.js` (sideLayout / sideOf / FIXED / gap choice; buildOutdoor and buildCompose take `openings`), `game.js` enterArea (seed, arrival), save code.
   - Size **M**. Risk: low perf impact. `test/diablo2-drlg.js` needs a new check (both ends' openings coincide); old saves need a migration to a new act seed.
2. **Wrong links let the player skip content.** [measured + docs]
   - Fix: delete the 2 HAND_LINKS rows. Re-check the Dark Wood entry (via the Underground Passage, waypoint).
   - Make the remake's Canyon reachable only by the Arcane portal or a waypoint. The quest gate already exists for Duriel.
   - Mirror the Act V Foothills strip: COMPOSE order 879…865, FIXED `{harrogath:'e', frigid_highlands:'w'}`, LINK_TRANS on Frigid's +x side.
   - Size **S**. Risk: `test/diablo2-drlg.js` and suite routes that walked Stony→Dark Wood must use the passage.
3. **Levels regenerate on every entry; monsters and the automap reset.** [measured]
   - Fix: cache built Levels per `(diff, act, areaId)` in memory for the session (D2 keeps them until a new game). Keep per-level entity state (`killed: Set(spawnIndex)`) and `seen` per level.
   - Size **S-M**. Risk: memory of ~10 cached Levels per act. Outdoor Level ≈ 80×80 tiles: `col` 160 KB plus layers ≈ 0.5 MB each, ≈ 5-10 MB per act [estimate].
4. **Walking crossings are teleports, not seamless** (void beyond the gap, overlay, monsters don't follow).
   - Fix: see E (seamless stitching). Interim: prebuild walking neighbours while idle, and skip the overlay when the build is ready (build takes 4-41 ms per area, measured with `ts.js`).
   - Size **L** (full) / **S** (interim). Risk: perf (section E).
5. **Warps behave differently.**
   - Fix:
     - export the warp tile clusters as `lv.warps: [{ to, x, y, rect, lit: tiles, noInteract }]` from `warpExits`, with lvlwarp.txt fields added to `maps_act*` by `build_world.py`;
     - make them clickable: hover shows the lit tiles and the target name; a click walks to the warp and enters;
     - keep proximity triggering only for `NoInteract`;
     - arrival = matching warp + lvlwarp `OffsetX/Y`, then auto-walk `ExitWalkX/Y`.
   - Files: `build_world.py`, `drlg.js`, `game.js` (hover / entAt / checkExits / enterArea), `engine.js` (draw the lit tile variant).
   - Size **M**. Risk: the touch controls in the suite tap exits; the test needs a tap-on-warp step.
6. **Act-specific placement details**: Blood Moor 56x96 / 96x56; Act I town DS1 variant must follow the rolled direction; Great Marsh bypass; Monastery group kept clear of the 200-tile strip north of the gate. Size **S** each once item 1 exists.
7. **Dirt paths from the town gates to the exits (Act I)**: port `DRLGOUTDOORS_SpawnAct1DirtPaths`. Size **M**. Cosmetic.

## E. Recommended architecture for seamless outdoor stitching

The cheapest correct shape for this codebase is a **sparse act world**: keep the per-area `Level` objects that `D2G.build` already returns, give each a world offset, and route every lookup that reads `S.grid` through a world object. A single giant grid is not recommended. The Act I bounding box can reach about 300×300 tiles (1500² subtiles), and `findPath`'s `PF` arrays (12 bytes × N, `game.js`:301) plus `seen` would cost about 30-40 MB [estimate]. Multi-tileset borders also rule out one `lv.tileset`.

```js
World = {
  act, seed,
  levels: { blood_moor: { lv: Level, ox, oy /* tile offset */, rect: [tx, ty, tw, th], state: 'built'|'stub' } , ... },
  index: Uint8Array /* bbox tile -> level slot (0 = void) */, bx, by, bw, bh,   // ~100 KB for Act I
  links: [{ a, b, side, seg: [x0, y0, x1, y1] /* shared edge, world subtiles */ }],
  colAt(x, y), levelAt(x, y), tileAt(layer, tx, ty) -> { ts, v }
}
```

- **Generation** (`drlg.js`):
  - `D2G.layoutAct(act, seed)` ports `sub_6FD823C0` and the linkers (pure, about 150 lines; rectangles only).
  - `D2G.buildWorld(act, seed, near)` builds the levels intersecting the activation box around the hero. Each `buildOutdoor` / `buildCompose` / town build gets `{ rect, openings: links.filter(...) }` and stamps the border opening (border preset picked-file 3/4) at the middle of `seg`.
  - Caves and dungeons stay as today: one Level per area, entered by warp.
- **Collision and pathing** (`game.js` `blocked`/`canStand`/`tryMove`/`los`/`findPath`/`openCellNear`/`openAround`, monster steering at :857/:894, `skills.js`:363-386 and :1174):
  - replace `g.col[iy*g.w+ix]` with `W.colAt(x, y)` (index lookup, then the level's local `col`);
  - `findPath` allocates its PF arrays for the search window (it is already windowed by `PF_MARGIN`), not for `w*h`.
- **Rendering** (`engine.js` render loop at :295-360, `drawTile`/`drawWall`): iterate visible world tiles, look up the slot through `index`, use that level's tileset (`WORLD.tilesets[L.lv.tileset]`) and local index. The 3 passes (floors/shadows, walls with entities by row, roofs) stay the same. Variant seeds use world tx/ty so tiles don't flicker when a level is rebuilt.
- **Area state** (`game.js`):
  - each frame, `a = W.levelAt(hero)`; on change set `S.areaId/S.def`, show the area name, switch music (`musicFor`), fire `questEvent({kind:'enter'})`, and auto-activate waypoints;
  - no overlay;
  - `checkExits` handles only warps and portals.
- **Monsters**:
  - spawn per level when the level is built (`spawnMonsters(def, lv, seed)` with world offset), and tag each entity `home = areaId` for monster level / TC / XP (today these read `S.def`);
  - `updateWorld` (:1620) updates only entities within an activation radius (about 60 subtiles, roughly the D2 "rooms near" ring);
  - entities in far levels sleep.
- **Automap** (`ui.js`:620-645): `seen` per level, drawn with offsets, so the map is continuous.
- **Save**: store `actSeed`. Corpse = `{ area, x, y }` in world coordinates.

Functions that must change: `D2G.build` gains a world entry point; `sideLayout`, `sideOf`, `edgeExits`, `buildOutdoor`, `buildCompose`, `buildJungle`, `buildPreset` (town); game.js `enterArea`, `checkExits`, `blocked`/`canStand`/`walkable`/`tryMove`/`los`/`findPath`/`openCellNear`/`openAround`, `markSeen`, `spawnMonsters`, `placeObj`, `placeQuestItems`, `updateWorld`, `musicFor` caller, save/load, `D2DBG` (`goto`, `teleport`, `exits`); engine.js `setLevel` and the render loop, `toWorld` users; ui.js automap; skills.js grid users.

**Cost** (honest guess):
- 1.5-3k changed lines and 3-5 agent sessions.
- Risk is in the long tail of `S.grid` users and in perf: the render loop stays per visible tile, but monster AI across 2-3 built levels doubles the entity count without the activation radius.
- Memory per Act I group ≈ 5 outdoor Levels ≈ 3-5 MB [estimate].
- Tests: `test/diablo2-drlg.js` (per-area reachability becomes per-world), plus a new suite check: "walk across Blood Moor → Cold Plains: areaId changes, no load overlay, hero keeps moving, monster follows".
- Do D.1-D.3 first (S-M, most of the perceived fix). Do E only if the owner wants no teleport at all.
