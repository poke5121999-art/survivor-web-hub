# Export: map/ (map prefab libraries) and prop/ (props)

Tools: `games/world-of-slime/tools/export_map.py`, `export_prop.py` (imports export_map). Viewer + screenshots:
`D:\wos-ref\proof\map\view.html`, `shoot.js`. Placement rules: `MAPBUILD.md`.

## Run

```
py -3.12 -I games/world-of-slime/tools/export_map.py     # ~2.5 min, 4 children at a time
py -3.12 -I games/world-of-slime/tools/export_prop.py    # ~12 min (197 small bundles, one child each)
```
A run without bundle names clears its own folder and rewrites everything (idempotent). With bundle names it only
rewrites those GLBs and leaves index.json alone (for debugging).

## Outputs (paths relative to the asset repo)

- `map/<folder>.glb`: one GLB per `map_*` bundle (49), named after the prefabs' Addressables folder (`t01_larus`,
  `cliff`, `ter03_grassland`, ...). Scene root node = folder name, its children = one node per prefab piece, named
  exactly like the prefab (= the `Map/<name>` address the game loads). Pieces keep their own root transform
  (usually identity). 3080 pieces, 124 MB GLB.
- `map/tex/<hash>.webp`: 394 textures, 5.3 MB, shared by all map GLBs (glTF `images[].uri = "tex/<hash>.webp"`,
  `EXT_texture_webp`). Hash = sha1 of the decoded, resized pixels. Max side 1024, q85; sides <= 16 px (ramps) lossless.
- `map/index.json` (2.9 MB): `bundles{name: glb, sourceBundle, folders, kb, pieces, deps, missing}`,
  `pieces[]{name, bundle, glb, address, meshes, materials, verts, tris, vertexColor, bounds{min,max} (glTF axes,
  relative to the piece root), root{translation,rotation,scale}, colliders[], particles, behaviours[], builtinMeshes[],
  inactive, skinned}`, `materials{id: shader, keywords, renderQueue, floats, colors, tex{prop: uri}, texST}`,
  `textures{hash: uri, name, src, w, h, alpha, kb}`, `combineNamesWithoutPiece[]`.
  Material id = material name, `#2`, `#3` when different materials share a name. Every GLB material also carries the
  same params in `material.extras` (+ `texIndex` = glTF texture index per property).
- `map/combine.json`: `data.bundle` MapCombineDataSet as is (`classfication.{grounds,waters,cliffs,routes,shadows}`,
  `freezeTile`, `landTypeClassfication`, `createPlaneHeight`, `staticCombinePass`) + `_pieceRoles{piece: [{kind,
  group, role}]}` reverse lookup. 497 piece names, 482 of them exist as pieces.
- `prop/<folder>.glb`, `prop/tex/`, `prop/index.json`: same layout. 197 bundles -> 197 GLBs, 205 pieces, 12.3 MB GLB
  + 122 textures 2.3 MB. Bundle names match content here except `item_cube00N` -> `cube00N`, `item_cubebase` ->
  `cubebase`, `object_pr_medicinalherb_0011` -> `pr_medicinalherb_001_1`. 52 animated pieces, 130 clips with channels
  (harvest trees/ore/herbs: Hit; cubes: idle/net/catch/success/fail; vehicle: 12 ride clips; slime merge machine: 13). Skinned props keep skeleton + skin, and the clips
  of their Animator controller (AnimatorOverrideController resolved) as glTF animations (30 fps, LINEAR,
  `extras.loop/duration/events`). Piece `clips[]` lists name, channel count, duration, skipped curve kinds.

## Conventions for the web side

- Unity X is negated (wos.py): Unity (x,y,z) -> glTF (-x,y,z), quaternion (x,-y,-z,w), Unity yaw t -> three yaw -t.
- Vertex colours are the custom attribute `_COLOR` (three: `geometry.attributes._color`), not COLOR_0, so three does
  not multiply them into albedo. The env shaders use them as masks (Tile Blend, wind).
- `KHR_mesh_quantization`: NORMAL is int8 normalized, TEXCOORD_n in [0,1] is uint16 normalized (other UVs float).
  three r160 GLTFLoader supports it.
- Built-in Unity primitives (`unity default resources`: Plane 60, Cube 8, Quad 7, Cylinder 5, Sphere 2) are not in any
  bundle. Their nodes are kept with `extras.builtinMesh` and the piece lists them in `builtinMeshes[]` (node, mesh,
  materials, nodeMatrix). Build them in three: Plane = 10x10 m XZ, Quad = 1x1 m XY, Cube 1 m.
- Shaders seen (map): MixMaster/Enviroment/Base 277 materials, Tile Blend 78, Transparent 38, Particles/* 25,
  Fog/VerticalFog_URP 11, Depth Water 10, URP Lit 10, Unit Matcap 6, Shadow Projector 4, Stencil Buffer Mask 3, few
  others. glTF `alphaMode` BLEND for Transparent / queue >= 3000; everything else OPAQUE.

## Proof

`D:\wos-ref\proof\map\`: `terrain_autotile_patch.png` (Cliff_01-A plateau placed with the MAPBUILD rules, 55 deg),
`terrain_cliff_set.png` (autotile pieces of Cliff_01-A/03-A, Water_01-A, Ground_t01), `terrain_ter01_forest.png`,
`town_t01_larus.png` (132 town pieces). `D:\wos-ref\proof\prop\`: `props_contact_1.png`, `props_contact_2.png`,
`props_animated.png` (skinned props at t=0.4 of their idle clip). The game camera is 40 deg in `level3` (MAPBUILD
section 6); shots use 55 deg as asked. Re-shoot: serve view.html at / and the asset repo at /a/, then
`node D:\wos-ref\proof\map\shoot.js <port> '[["name","glb=map/cliff.glb&mode=patch"]]'` (`OUT=` sets the folder).

## Traps hit

1. **Bundle file names do not describe their content.** `map_ter05_cave.bundle` holds `t01_Larus`, `map_ter01_forest`
   holds `Path_06`, `map_path_01` holds `t03_Noecheon`, etc. Never pick a bundle by its file name; use the container
   address folder (index.json `bundles[].folders`, `sourceBundle`).
2. A `multiprocessing.Pool` worker that dies (MemoryError on the shared machine: other agents use most of the commit)
   loses its task and the parent waits forever. Now every bundle runs in its own child process
   (`export_map.py --one ...`) with a 900 s timeout and one retry.
3. Re-encoding the same Mesh once per material combination doubled some GLBs. Vertex accessors and index buffers are
   cached per mesh; only the primitive/material list differs.
4. One-bone skinned meshes have no weight channel: UnityPy `m_BoneWeights` is None. Use weight 1.
5. MonoScript key in `bundle_index.json` `scripts` is `CAB-<hash>:<pathid>` with the CAB name as written (not lower case).
6. Renderer material slots with path id 0 (empty slot, magenta in Unity) are legal; the primitive gets no material.
7. GLB sizes: town libraries are big (t01_larus 13.5 MB, t03_noecheon 13.3 MB, int04 9.1, t06 9.1). Positions are
   still float32; meshopt compression would cut them further but needs gltfpack.

## Missing / not exported

- ParticleSystems: 223 in map pieces (count per piece in `particles`). Not portable; reimplement.
- Unity built-in primitive meshes (82 nodes): recorded, not exported (see above).
- AnimationClips in mapres_* (wind/water clips on FBX objects, Animation component in synt01): not exported for maps;
  wind/wave is shader driven (`_UseWind`, `_WindSpeed`, `_WindStrength`, `UseVertexWave`, ... in material floats).
- Shader code: only names + params; the web needs its own approximations (view.html has a toon ramp one).
