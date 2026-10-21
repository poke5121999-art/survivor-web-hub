# World of Slime Demo: how the 3D map is built from tile data

Measured 2026-10-21 by decompiling `GameAssembly.dll` with `il2cpp_method.py` (every claim names the method; re-run
`il2cpp_method.py <Type.Method>`), plus UnityPy reads of `map_cliff.bundle` (mesh AABBs) and `level3` (scene roots).
`GUESS` marks anything not read directly from code or data.

## 0. Bottom line for the three.js remake

- **The runtime does no autotiling.** `_tile.dat` already lists, per cell, the exact prefab name, euler rotation and
  scale. The game only instantiates `Map/<name>` at `(x + 0.5, floor, z + 0.5)` and applies rotation/scale
  (`AddressMapLoader.CollectLoadObjectFromMap`, `AddressMapLoader.LoadMapObjectInitialize`).
- The autotile rules (center/edge/corner choice + rotation) live in the **map editor code that ships in the build**
  (`SMEditor.Map.MapObject`, `MapFuncHelper`, `PolygonData`, `PointData`). Since the `.dat` files are behind signed
  S3 URLs (403, see CODE.md), the remake has to author its own grid and run these editor rules itself. Section 5 gives them.
- Grid cell = **1 m x 1 m**, floor step = **1 m**, x = column (`index % width`), z = row (`index / width`), no flips, map
  origin at world (0,0,0), cell (x,z) covers world [x, x+1] x [z, z+1].

## 1. Data formats

### `map_type_{id}_client.dat` -> `ClientMapData` (MessagePack)

Runtime type `SM.Common.Data.ClientMapData` (field offsets from `--fields`):
`width:int, height:int, layers:List<LayerData>, floors:int?[], cameraMoveRect:RectData, verticalFogData, bgm:string,
landType:int?[], cloudProjectorData, mapBackgroundType:int, mapLightType:int, positionMarkerDatas:List<PositionMarkerData>`.
The editor twin `SMEditor.Data.ClientMapData` has the same fields minus `layers`. The runtime methods read `floors` at
+0x20 and `layers` at +0x18, i.e. the `SM.Common.Data` layout (`MapController.GetFloorHeightFromMapData`,
`AddressMapLoader.CollectLoadObjectFromMap`). GUESS: `MapDataLoader.mergeClientMapDataMap` holds the client data with
`layers` filled from `_tile.dat`.

Nested types:
- `RectData{startX, startY, endX, endY, fov}` (camera move limits; `MapFuncHelper.CameraMoveLimitRectToLimitPos`).
- `VerticalFogData{height, farDistance, nearDistance, color, fogPosDynamic}`.
- `CloudProjectorData{speedX, speedY, color, shadowTextureName, shadowTiling, noiseTextureName, noiseTiling, height, yScale}`.
- `PositionMarkerData{type:int, pos:Vector2}`.

Deserialised by `ClientMapData.GetPlayClientMapData` -> `MessagePackSerializer.Deserialize` with default options (no LZ4
option passed).

### `map_type_{id}_tile.dat` -> `TileMapData` (MessagePack)

`TileMapData.GetPlayTileMapData` -> `MessagePackSerializer.Deserialize<TileMapData>`.

```
TileMapData { width:int, height:int, layers: List<LayerData> }
LayerData   { floors: List<FloorData> }
FloorData   { floor:int, tiles: List<TileData> }
TileData    { index:int, name:string, rotation:Vector3 (euler deg), scale:Vector3, isInvisible:bool, useImposterObject:bool }
```

`TileDataFormatter.Deserialize` reads an **array header** and keys 0..5 in that order (int keys, not a map):
`[index, name, rotation[x,y,z], scale[x,y,z], isInvisible, useImposterObject]`. Unknown extra keys are skipped.
There is no prop list, no piece address and no per-tile height beyond `floor`: props, stairs, cliffs, water, paths and
grounds are all just `TileData` entries, told apart by name (section 3).

### `floors[]` and `landType[]`

- Index = `floor(x) + floor(z) * width`, x first, row-major by z (`MapController.PositionToMapIndex`; the call at
  0x1806f85a0 is the target of `Math.Floor(double)`).
- `floors[i]` = walkable top height in metres of cell i, as an int. The editor writes it as
  `max(highest cliff/ground tile floor, highest water floor) + 1` (`DigitalizedMapData.ToClientFloorHeightData`,
  `DigitalizedMapData.GetHeightsOrOperToExceptTiles` stores `new int?(floor + 1)`).
- `null` = no ground. `GetFloorHeightFromMapData` returns **-999** for null or out of range.
- `landType[i]` = `MapCombineDataSet.LandType`: -1 None, 0 Ground, 1 Grass, 2 Stone, 3 Water, 4 Snow, 5 Sand
  (`MapController.GetLandType` -> `PositionToMapIndex`). The editor derives it from tile names via
  `landTypeClassfication` (`DigitalizedMapData.ToClientLandTypeData`). It drives footstep/prop sounds.

## 2. Tile size, orientation, origin

- Tile footprint 1 x 1 for every batching type: `AddressMapLoader.GetTileSizeFromTileBatchingType` returns
  `Vector3Int(1,1,1)` as a constant.
- `CollectLoadObjectFromMap`: `x = index % width`, `z = index / width` (idiv), `indexToPos = (x, floor, z)`,
  `tileSize = (1, 0, 1)`.
- `LoadMapObjectInitialize`: `localPosition = indexToPos + tileSize * 0.5` = **(x + 0.5, floor, z + 0.5)**.
- Width runs along +X, height (rows) along +Z. Editor directions agree: `PolygonData.GetNext` Right = x+1, Up = y+1
  (= +z), Left = x-1, Down = y-1. No z flip anywhere (`MapFuncHelper.ConvertIndexToBasePositionForTile` is the same
  `% / width` split).
- Map root: scene object `Map` (`MapController.Initialize` -> `GameObject.Find("Map")`), at local (0,0,0) under `3d`
  (0,0,0) in `level3`. Water-layer pieces go under a `Map_Water` parent instead (`AddressMapLoader.<Make>d__13.MoveNext`
  picks `'Map'` / `'Map_Water'` by `MapObjectsInfoData.isWaterLayer`).
- Piece meshes are authored around the cell centre, footprint x,z in [-0.5, 0.5] (AABBs read from `map_cliff.bundle`):
  `Ground_t01_001` top y = 1.0; `Cliff_01-A_2_a_1` (cliff centre) flat at y = 1.0; `Cliff_01-A_2_b_*` (rim edge)
  y from -7 to +1 (an 8 m skirt); `Cliff_01-A_1_b_*` (ground edge) a 1 m wall from y 0 to 1 at local z = +0.5;
  `Water_01-A_0_a_1` surface at y = 0.556. Prefab roots have identity transforms.
- So a tile with `floor = f` shows its walk surface at y = f + 1, which matches `floors[] = f + 1`.

### Height lookup (for units)

`MapController.GetHeight(ClientMapData, LoadedMap, pos)`:
1. `h = GetFloorHeightFromMapData(pos)` (int, -999 if none).
2. If `loadedMap.mapLoaderData.floorsAddToTileclassification[i]` (float?[], length = floors.Length, created in
   `MapLoaderData..ctor`) has a value, `h += value` (route plane offset; GUESS: filled by `AddressMapLoader.SetAddHeightRoute`).
3. For each stair in `loadedMap.mapComponentData.stairList` whose `HeightPropData.IsInside(pos)`: return
   `HeightPropData.TranslateHeightPosition(pos)` instead.

Units use it directly: `HeightBehaviour.Update` stores `MapController.GetHeight(transform)` as `_heightPosition`.

## 3. Tile name -> prefab, and how MapCombineDataSet is looked up

- Address = `TileAddressName + "/" + tile.name` = **`Map/<name>`** (`AddressMapLoader..ctor` sets
  `TileAddressName='Map'`, `ImposterAddressName='ImposterObjects'`, `ImposterObjectNamePrefix='imposter_'`).
  If `useImposterObject`, it also loads `ImposterObjects/imposter_<name>`. `isInvisible` tiles are skipped.
  `MapObjectManager.GetMapObjectClone(address)` clones the Addressable. Which bundle: the Addressables catalog maps the
  key to the `map_*` bundle holding that prefab (e.g. `Cliff_*`, `Water_*`, `Ground_*` in `map_cliff.bundle`;
  `Path_t07-*` in `map_path_t07.bundle`; meshes in `mapres_*`).
- Name grammar (from `MapCombineDataSet.json` and `MapCombineDataSet.GetCreatePlaneHeight`):
  `<Kind>_<set>-<Variant>_<tier>_<role>_<n>`, e.g. `Cliff_t01-A_2_b_3`, `Water_06-A_0_b_2`, `Path_t07-A_a_1`
  (paths have no tier). role letter: `a` centre, `b` edge, `c` convex corner, `d` concave corner (matches the lists).
  Cliff tier `2` = top rim pieces (centre/edge/convex/concave), tier `1` = ground pieces (`groundEdgeTiles`,
  `groundCornerTiles`). Grounds are single pieces `Ground_<set>_<nnn>` with only `centerTiles`.
- Classification lookup (`MapCombineDataSet.FindClassification`, cached in `cachedClassfication`):
  name `StartsWith('Ground')` -> `grounds`, `'Path'` -> `routes`, `'Cliff'` -> `cliffs`, `'Water'` -> `waters`
  (static names from `MapCombineDataSet..cctor`: None, Ground, Water, Cliff, Path, Stair, Shadow). Inside the list,
  the first entry whose `tileClassificationName` is a substring of the name wins (`FindTypeClassificationFromList`,
  `String.Contains`), then `ClassficationData.GetCliffCompositeType` finds the role by `FindIndex` in
  centerTiles(0) / convexCornerTiles(1) / concaveCornerTiles(2) / edgeTiles(3) / groundCornerTiles(4) /
  groundEdgeTiles(5). Batching type: Cliff 0, Water 1, Prop 2, Ground 3, Route 4 (`MapCombineDataSet.TileBatchingType`);
  anything not matched is a prop. `IsStairTile` = `name.ToLower().Contains("stair")`.
- At runtime the classification is only used for: water parent (`IsWaterTile`), route y offset, freeze/merge
  decisions, stairs. It is not used to choose pieces.

## 4. Floors, cliffs, stairs

- One floor = 1 m (`indexToPos.y = floor`, integer floors, `floors[] = floor + 1`).
- A cliff of several floors is several `TileData` on different `FloorData.floor` values in the same cell column. The
  top rim edge mesh hangs 8 m down (`Cliff_*_2_b_*` AABB y -7..1), so one rim piece covers drops of up to 8 floors.
  GUESS: lower floors under a rim are usually empty or ground-tier pieces.
- Route (path) tiles get `y += MapCombineDataSet.GetCreatePlaneHeight(name)` + `routeOverlappedHeight`
  (`LoadMapObjectInitialize` when batching type == Route). `GetCreatePlaneHeight` splits the name on `'-'`, takes part
  [1], splits on `'_'`, takes [0] (the variant letter A..F) and looks it up in `createPlaneHeight.list`: all six are
  **0.005 m**. GUESS: `routeOverlappedHeight` (`GetOverlappedRouteAddHeight(orderRoute, name)`) stacks extra small
  offsets when several path sets overlap.
- Stairs: prefabs whose name contains "stair" (`map_ter00_stair.bundle`) become `MapComponentStairData{name,
  HeightPropData}` (`AddressMapLoader.SeparateMapComponent`). `HeightPropData{minX,maxX,minZ,maxZ,minHeight,maxHeight,
  rotation 0..3, step, level, reverseX, reverseZ}` is built from the stair's BoxCollider world bounds
  (`HeightPropData..ctor`, `GetWorldBoundsFromLocal`). `TranslateHeightPosition`: rotation 0 -> t along +x
  (minX..maxX), 1 -> +z, 2 -> -x (maxX..minX), 3 -> -z; `reverseZ` swaps the direction; `t = clamp01(...)`,
  `height = minHeight + (maxHeight - minHeight) * t`.

## 5. Autotile rules (editor code, needed because the remake has no `_tile.dat`)

Algorithm in `MapObject.UpdatePolygonTile` -> closure `<>c__DisplayClass94_1.<UpdatePolygonTile>b__0`:

1. Per floor F and per kind (cliff+ground, water, route), the editor traces region outlines as `PolygonData`
   (`MapObject.FindPolygon`, `PolygonData.FindOutlIneAndCornerAndEdge`). The outline is a list of boundary **cells**
   (`orderedPoints: List<PointData{direction, prevDirection, point:Vector2Int}>`), each with the step direction into it
   (`direction`) and the previous step (`prevDirection`). `PolygonData.IsInside` marks hole outlines.
2. `highest` = (the highest cliff/ground floor in that cell, `DigitalizedTileData.GetHighestFloorOrOper`) == this
   polygon's floor.
3. Role (`MapFuncHelper.GetTileCompositeType`):
   - not highest: `direction == prevDirection` -> **GroundEdge (5)**, else **GroundCorner (4)**.
   - highest: `direction == prevDirection` -> **Edge (3)**; else `c = PolygonData.IsPointConcave(point, orderedPoints,
     allLinked)` (a CW test on prev/current/next, `GetLineCW`) -> `c ? ConcaveCorner (2) : ConvexCorner (1)` for normal
     points (`return c + 1`); inverted (`c ? 1 : 2`) when the point `is HoleApproachPointData` (type test on
     `TypeInfo(HoleApproachPointData)` in the same method).
   - Cells inside the outline get **Center (0)** (GUESS: the interior fill path; not traced in this pass).
4. Piece: `MapFuncHelper.GetTileObject(origin, batchingType, role, nearbyStair = DigitalizedMapData.HasHeightPropsNearby)`
   -> `TileClassification.GetCliffTile / GetWaterTile / GetRouteTile` -> one name from that role's list.
5. Variant pick: `BaseTileClassification` keeps one `RandomRoulette` per role. `RandomRoulette.Make` adds each
   `TileWithProbability` `probability` times; `SetProbability` sets probability = 1, so **uniform**. `Choice()` =
   `System.Random.Next(0, count)` with `new Random()` (unseeded). The choice is baked into `_tile.dat`, so the game
   itself never re-rolls. For the web: any stable hash of (x, z, floor) is fine.
6. Rotation (`MapFuncHelper.GetRotation` -> `PointData.GetRotation(isInside)` for Cliff/Route/Shadow,
   `PointData.GetWaterRotation(role)` for Water). Euler (0, Y, 0) degrees; directions R=+x, U=+z, L=-x, D=-z:

   | case | cliff / route Y | water Y |
   |---|---|---|
   | edge, dir R | -180 | 0 GUESS (branch reads a static Vector3, likely zero) |
   | edge, dir U | 90 | -90 |
   | edge, dir L | 0 | -180 |
   | edge, dir D | -90 | 90 |
   | corner prev R -> U | 90 | -90 |
   | corner prev R -> D | 0 | 180 |
   | corner prev U -> R | -90 | 90 |
   | corner prev U -> L | 0 | 180 |
   | corner prev L -> U | 180 | 0 |
   | corner prev L -> D | -90 | 90 |
   | corner prev D -> R | 180 | 0 |
   | corner prev D -> L | 90 | -90 |
   | extra | corners +180 if polygon `IsInside` (cliff) | +180 if role == ConcaveCorner (water) |

   Edge rows of `GetRotation` return directly; only the corner rows get the `isInside` +180.
   Centre tiles: rotation (0,0,0) unless the editor brush set one (`TileData.rotation` is free).
   The winding (CW or CCW) of `orderedPoints` was not traced: test both on one rectangle and keep the one whose rim faces out.
7. Scale: authored per tile; negative x/z scale means mirror (section 6).

## 6. What the renderer needs besides placement

- **Transform per tile** (`LoadMapObjectInitialize`):
  `rot = Quaternion.Euler(tile.rotation)` (Unity ZXY order), then `ToEulerRad` + `MakePositive` (no visual change);
  `scale = tile.scale`. For names other than `shadow_001..004` / `ter01_shadow_001..004`: a negative `scale.x` or
  `scale.z` is made positive and the mesh is mirrored instead (`CollectFlipData`, `ApplyFlip`, `FlipVertex`,
  `FilpIndexs`, `FlipNormal`). In three.js a negative scale gives the same picture (three flips the winding when the
  determinant is negative). localScale is set only if |scale| > 0.
- **RandomRotate**: if the clone has `SM.Common.Object.RandomRotate{flipXScaleRandomize, PositionRandomRange,
  RotationRandomRange, ScaleRandomRange}`, `RandomRotate.GetRandomValue` replaces pos/rot/scale with the clone's own
  transform plus one of 5 steps picked by `UnityEngine.Random.Range(0,5)` (unseeded): +range, +range/2, flip x scale
  (if `flipXScaleRandomize`), -range/2, -range. The input is the clone's current transform, not the cell position;
  GUESS: shipped root prefabs do not carry it (else such props would collapse to the origin). Check with UnityPy before
  copying it.
- **Loader in use**: `MapController.MapLoaderType = 3` (`MapController..cctor`) -> `CombineMapLoader`
  (0 AddressMapLoader, 1 FreezeMapAddressMixedLoader, 2 BakeSceneMapLoader, 3 CombineMapLoader; switch in
  `MapController.Initialize`). `CombineMapLoader : FreezeMapAddressMixedLoader : AddressMapLoader`.
  - Freeze tiles: `MapCombineDataSet.IsFreezeObj(name)` = name in `freezeTile.freezeTileDatas` (510 cliff/water/ground
    names) or contains `containNameFreeze` (`'newPlane_'`).
  - Flat freeze tiles whose material is `MixMaster/Enviroment/Base` with `WorldUV` = 1 (`CheckPossibleOptimizeMaterial`)
    are replaced by one Quad per same-height, same-material rectangle (`CreatePlaneFromHeightSameMaterial`,
    `CreatePlaneFromRouteSameMaterial`, `CreateQuadPlane`: `GameObject.CreatePrimitive`, name `newPlane_<prefab>`,
    centre `((x0+x1)/2 + 0.5, floorSetValue, (z0+z1)/2 + 0.5)`, size `(x1-x0+1, z1-z0+1)` plus
    `Const.CorrectionValueToCameraAngle`, shadow mode and vertex colours copied). Because the material samples world
    UVs, this looks the same as per-tile placement. The rest goes through MeshCombineStudio `MeshCombiner`
    (`CombineMapLoader.DynamicCombine`); `staticCombinePass` (`synt01_machine_003`) is kept out of static combining.
  - For three.js: place per tile, then merge or `InstancedMesh` per (piece name, material). Use world-space UVs for
    `Tile Blend` / WorldUV materials, or merged ground quads will not tile the same way.
- **Props / objects**: map props come from the same `_tile.dat` (any tile name not Ground/Path/Cliff/Water, batching
  Prop). Living objects (NPCs, items, monsters) come from the server (`ObjectController`, `ItemController`), placed at
  `MapController.GetHeight`.
- **Sound props**: `SeparateMapComponent` collects prop-sound tiles into `MapPropCollisionSoundData`
  (`Enums.Wwise_Prop_Event` Bush, SnowBush; `MapController.GetCollisionPropSound`).
- **Camera**: `level3` `Main Camera` default transform pos (0.39, 81, -94.18), rotation x = 40 deg
  (quaternion 0.342, 0, 0, 0.940). Runtime framing is `FollowCamera` + `CameraController` presets (prefab values, not
  read), clamped by `ClientMapData.cameraMoveRect` (`MapFuncHelper.CameraMoveLimitRectToLimitPos(rect, angle,
  height, ...)`, `CameraPosFromTargetPos(target, angle, height)`).

## 7. Pseudo-code (runtime placement, what the remake should copy)

```js
// tiles: TileMapData; cd: MapCombineDataSet.json
for (const layer of tileMap.layers)
  for (const fl of layer.floors)
    for (const t of fl.tiles) {
      if (t.isInvisible) continue;
      const x = t.index % width, z = Math.floor(t.index / width);
      let y = fl.floor;                                   // 1 floor = 1 m; mesh top sits at y+1
      if (t.name.startsWith('Path')) y += createPlaneHeight(t.name) /* 0.005 */ + overlapAdd(t.name);
      const obj = clonePrefab('Map/' + t.name);           // from map_* bundle export
      obj.position.set(x + 0.5, y, z + 0.5);              // Unity coords
      obj.rotation = unityEulerZXY(t.rotation);           // degrees
      obj.scale.copy(t.scale);                            // negative = mirror
      (isWater(t.name) ? mapWater : map).add(obj);
    }
// Unity -> three with the existing pipeline (flip X): pos (-ux, uy, uz); quat (qx, -qy, -qz, qw); Y-only rot -> -Y.
// walk height at (px,pz): floors[floor(px) + floor(pz)*width] (+route add, or stair lerp); null -> no ground.
```

Autotile (only because we must make our own grid):

```js
for each floor F, kind in [cliff, water, route]:
  for poly of traceOutlines(cellsAtOrAbove(F, kind)):        // boundary cells with direction/prevDirection
    for p of poly.orderedPoints:
      const highest = highestCliffGroundFloor(p) == F;
      const role = !highest ? (p.dir == p.prev ? GROUND_EDGE : GROUND_CORNER)
                 : p.dir == p.prev ? EDGE
                 : (isConcave(p) != isHoleApproach(p)) ? CONCAVE : CONVEX;   // section 5.3
      const name = pickUniform(cd.classfication[kind][set][roleList(role)], hash(p.x, p.z, F));
      const rotY = kind == 'water' ? waterRot(p, role) : cliffRot(p, poly.isInside);
      emit({ index: p.x + p.z * width, floor: F, name, rotation: [0, rotY, 0], scale: [1, 1, 1] });
  interior cells -> centre piece, rotation 0.
```

## 8. Not determined

1. `_tile.dat` / `_client.dat` contents for any real map: behind signed S3 (CODE.md). Without them no map can be
   reproduced 1:1; only rebuilt by hand with the rules above.
2. Interior fill (which cells get Center) and how ground (`Ground_*`) tiles are laid under cliffs: not traced
   (`MapObject.GetCliffGroundPolygonDatas`, `MapObject.ResetCliff`, `UpdateFloorsFromCurrentTile`).
3. Outline winding and start point (`PolygonData.FindOutlIneAndCornerAndEdge`), and exact `IsPointConcave` maths.
4. `floorsAddToTileclassification` fill and `GetOverlappedRouteAddHeight` order rules (`AddressMapLoader.SetAddHeightRoute`,
   `TileRouteAddHeight`).
5. Which prefabs carry `RandomRotate`, `Const.CorrectionValueToCameraAngle` value, `floorSetValue` of merged quads.
6. Camera preset numbers (on prefabs).

## 9. Checked against the exported pieces (export_map.py, 2026-10-21)

Proof image: `D:\wos-ref\proof\map\terrain_autotile_patch.png` (`view.html?glb=map/cliff.glb&mode=patch`): a 10x8
cell patch, lower floor -1 everywhere plus an L-shaped plateau on floor 0, set `Cliff_01-A`. Rim edges, convex and
concave corners join without seams, so the 1 m cell, the (x+0.5, floor, z+0.5) placement and the rotations below hold.

- Facing of each role at rotation 0, measured from the mesh vertices (Unity axes): rim edge `_2_b_*` skirt on **+z**;
  convex corner `_2_c_*` skirt toward **+x+z**; concave corner `_2_d_*` dip toward the **-x-z** diagonal. So, by the
  side that is outside the region: edge N 0, E 90, S 180, W -90; convex NE 0, SE 90, SW 180, NW -90; concave (missing
  diagonal) SW 0, NW 90, NE 180, SE -90. This matches the section 5 table if the outline runs **counter-clockwise**
  seen from above (+x right, +z up): edge dir L (west along the north rim) = 0, dir R = -180, dir U = 90, dir D = -90.
- The lower floor must cover the cells under the plateau too (the editor polygons are `cellsAtOrAbove(F)`): without
  it you see the sky between the inset skirt and the next lower cell.
- Neighbour-mask form of the same rule (what view.html uses): in-region cell with one outside side = edge, two
  adjacent outside sides = convex, no outside side but one outside diagonal = concave, else centre.
- `RandomRotate` is on exactly two exported pieces: `t07_grass_001`, `t07_grass_002` (piece `behaviours` in
  `map/index.json`). `SoundMapProp` is on 54 pieces (bush sounds).
- In the web export (glTF) Unity X is negated: place a tile at three `(-(x+0.5), floor, z+0.5)` and yaw `-rotY`.
- Piece lookup for `Map/<name>`: `map/index.json` `pieces[]` has `name` and `glb`; the piece is the root child node of
  that name. Bundle file names do not match content (`map_ter05_cave.bundle` holds `t01_Larus`), so GLBs are named by
  their Addressables folder. Cliff/Water/Ground/autotile sets are all in `map/cliff.glb` (330 pieces).
- 15 names in MapCombineDataSet have no prefab in the demo: `Cliff_01-C_1_b_2`, `Cliff_t01-B_1_b_1/_b_2/_c_1`,
  `Cliff_t09-A_2_*` (7), `Path_t05-C_a_1/_b_1/_c_1/_d_1`. `Cliff_03-A` has edges `_2_b_1.._3` only (no `_b_4`).
