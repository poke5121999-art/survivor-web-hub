# data/ : house layouts from the Unity game

`rooms.js` is generated, do not edit. `js/housegen.js` turns it into houses.

## Files

| File | What |
|---|---|
| `data/rooms.js` | `ROOMS`, `HOUSE_SPECS`, `MIN_PAD_SPACING` (ES module, about 800 KB) |
| `tools/export-rooms.js` | node, no dependencies: reads the Unity prefab YAML directly and writes `rooms.js` |
| `js/housegen.js` | `generateHouse({ theme, houseIndex, seed })`, port of `HouseGen.cs` |
| `tools/house-check.js` | 5 themes x 5 houses x 20 seeds, exit 1 on any failure |

## rooms.js format

Tile coordinates, x right, y down, 1 tile = 1 m (1 tile = 24 px in Unity).

```
ROOMS[theme][kind] = [room, ...]      theme: vampire pyramid vietnam spacestation asylum
                                      kind:  shared corridor deadend private extract special truck
room = {
  name, kind, w, h,
  rows: [string],     ' ' unpainted wall core (blocks, draw nothing)   '.' floor   '#' wall
                      'F' floor cell blocked by a prop   'd' wall cell inside a declared door span
  size: small|medium|large|short|long|extralong,  direction: horizontal|vertical,
  maxDoors,           door cap when placed (-1 = default: corridor 2, others unlimited)
  allowFlip,          generator may mirror the room
  doors: [{side 0 left 1 right 2 top 3 bottom, pos}] | null     pos = middle cell of the 3-wide span along that side
                      null = prefab declares none, generator opens the middle of every side
  loot: [{x, y, place: 'floor'|'table'}],  foes: [{x, y}],  traps: [{x, y, kind, dir, len}],
  props: [{x, y, w, h, name, blocks}],     blocks=false is decor (rug, picture), w/h = 1
  pad: {x, y, fx, fy, nut?} | null,  pads: [...] when a room has several
  lights: [{x, y, name}],                  decor lights, picked by prop name (lamp, torch, candle...)
  order,              index inside its pool (shuffle order and prefab id in the generator)
  file,               source prefab; truck rooms also have truck, cart, parking, ram ('top'..'right' or null)
}
HOUSE_SPECS[theme][1..5] = counts from gamespark-config/stage_theme_houses.json (identical for the 5 themes)
MIN_PAD_SPACING = stage_rules.minPadSpacing (3 doors)
```

`extract` and `special` follow `RoomLibrary.Extract(style, kind)`: the theme folder `_extract_<theme>` if it has rooms of that kind,
else the shared `_extract`. `truck` follows `_truck_<theme>` else `_truck`. Shared rooms are copied into each theme that uses them.

Rooms exported (shared, corridor, private, extract, special, truck): vampire 14/4/2/3/3/4, pyramid 13/10/1/3/3/3,
vietnam 13/4/1/3/3/3, spacestation 9/5/1/4/3/3, asylum 12/4/1/3/3/2. No `deadend` rooms exist in the game data.

## How the exporter reads a prefab

`ToRoomDef` (RoomTemplate.cs) is mirrored: `RoomCell` characters first, then the `Wall` tilemap (tile present = `#`) and the
`San` tilemap (no floor sprite and no wall = ' '), then props (`PropPiece`/`PropProc`, `blocksPath`, `hopSize` boxes,
`blockingRows`, `ForceBlock`/`ForceNoBlock`, floor-spread layer = not blocking) set `F`, then `RoomDoor`, `DeliveryPad`,
`TrapPoint`, `TruckPoint`. Props, loot points, foe points and pads are nested prefab instances; they are expanded with their
`m_Modifications` (position, name, active, field overrides). Tile cells are mapped to room tiles through the Grid and Tilemap
transforms exactly as `RoomTemplate.Cell` does. Script GUIDs are resolved through the `.cs.meta` files, prefab GUIDs through
the `.prefab.meta` files. Tile asset GUIDs are only checked for "tile/sprite present" (no art is exported).

Re-export (about 20 s, read-only on the Unity repo):

```
node tools/export-rooms.js [--repo D:/REPO_Topdown] [--cfg D:/REPO_Meta/gamespark-config] [--out data/rooms.js]
node tools/house-check.js  [--seeds 20] [--maps <dir for the ASCII maps>]
```

## generateHouse

`generateHouse({ theme, houseIndex 1..5, seed }) ->`

```
{ w, h, grid: Uint8Array (0 void, 1 floor, 2 wall, 3 door zone), block: Uint8Array (1 = blocking prop on that floor cell),
  rooms: [{ id, kind, x, y, w, h, template, flipX, flipY, car? }],      rooms[0] is the truck room; rect includes the walls
  doors: [{ x, y, dir (0 = walk along x), jammed, a, b, x0, y0, zw, zh }],   connector zone 3 wide, 2 thick or more
  pads: [{ x, y, fx, fy, roomId, order, button }],   pad 0 is in the truck room, then one per extract room
  truck: { x, y, w, h, roomId, ram, car, template },  start: { x, y } nearest 3x3-free cell to the truck marker
  loot, foes, traps, props, lights   (all with roomId, world tile coords, flips applied)
  droppedLoot, padRooms, meta }
```

Same seed, same house. The search is the C# one (grow tree of rooms and 3-wide connectors, leaves for extract and private rooms,
`CartReach`, `PadsSpaced`, variety retries), with the same RNG streams as `buildLevel` (`seed ^ 0x4e6f6931`, `0x6b1d2c93` for
the layout, `0x6d3b90c7` truck pick, `0x3e7a8c21` pad pick, `0x5bf03635` jammed doors; mulberry32). Not run against Unity
output: parity of the exact layout for one seed is untested, the counts and rules are.

## Not ported / differences

- Two-truck PvP houses: `AttachTruck`, `CornerAlong`, arena maps. PvE has one truck.
- Layout diagnostics (`extractMiss`, `attemptStats`, fallback flags). A house that no seed can build throws, as `buildLevel` does.
- The build frame is not rounded up to whole 21x15 modules (that padding is for the Unity world texture and the ram cut-scene);
  `w`/`h` are tight with a 1 tile margin. `truck.ram` is still reported.
- Loot sizes: `LootRules.SpotCap`, `LootPoint` caps and `ClampToCovers` (spots hidden behind tall props) are not applied, so
  loot spots carry no size cap. Table loot is listed as `place: 'table'` with the cell, not the exact rest point.
- Loot and foe spots are listed, not drawn from: choosing which spots get items or foes, quota, value, `foeCount` are game logic.
- Pad button position fallbacks (`BTN_TRY`, `hitsSolid`): the prefab nut is used when present.
- Jammed doors use the same rules as `lockDoors(sealRoomsOk)` (at most 25% of doors, 30% of floor sealed, cart route and pad
  buttons kept) on the tile grid; house 1 never has any (`DOOR_LOCK_LEVEL`).
- Vietnam village rules (`openVillageContacts`, yard fences, no door leaves) and all art: floor/wall sprites, FrontFace, decor
  sprites, door art. `lights` is a name heuristic, the game has no light component in room prefabs.
- Prefab data the exporter ignores: rotation about x/y, `m_AddedGameObjects` (none were found), weather, `tier`, `requiresIce`.
- `_chung`, `_ride`, `_shop`, `_tutorial`, `_skilldemo` rooms are not exported (not part of the 5 houses).

## Cart reach

The game checks cart reach at door level only (`HouseGen.CartReach`: both ends of every connector sit on a declared door cell).
`RoomCheck.CART_CLEARANCE` says there is no longer a cart lane rule between doors inside a room, and pads only need a 3x3 free
spot (`G03_World_a.cs roomPoint`). So on the tile grid a cart cannot always push through a cluttered room: `house-check` prints
`padCart%` (share of pads the 3-wide flood reaches from the truck, 28% to 100% by theme; pyramid is the most open) and asserts
the door-level rule plus walking reach, not full cart reach. A 3D port that needs the cart to reach every pad has to open
those rooms itself.
