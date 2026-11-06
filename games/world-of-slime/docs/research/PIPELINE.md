# Art pipeline proof: one slime + one map piece (2026-10-21)

Status: works end to end. One slime exported with its skeleton, skin weights, all 12 clips, face-expression curves
and textures, and shown in three.js r160 with a toon shader. Map library bundles export with their meshes,
textures and transforms. A placed map layout is not in these bundles: the game builds it at runtime (see Map).

## Files

| Path | What |
|---|---|
| `tools/cabmap.py` | builds `cache/cabmap.json` (CAB name -> bundle file) from bundle headers only. Takes about 3 min for 4213 bundles. Run it once. |
| `tools/wos.py` | shared code: dependency-closure loader, Unity->glTF conversion, clip decoder, GLB writer, texture encoder |
| `tools/export_slime.py` | `py -3.12 -I tools/export_slime.py SL_Bat_WindDark [--png]` -> `proto/slime/<name>.glb` + `<name>.json` (sizes, rule, per-clip report) |
| `tools/export_map.py` | `py -3.12 -I tools/export_map.py map_path_t07` -> `proto/map/<name>.glb` + `.json` |
| `tools/shoot.js` | Playwright screenshots of `proto/view.html` (needs `py -3.12 -m http.server 8765` in `proto/`) |
| `proto/view.html` | viewer. Params: `view=slime/map/both`, `clip=_Walk`, `t=0.3` (freeze), `cam=game`, `map=<name>`, `outline=0`, `blend=1` |
| `proto/shots/*.png` | idle, idle_game, idle_b, walk, walk2, attack, attack2, hit, map, map_historicsite, both, contact |
| `tools/dump_*.py`, `dbg*.py`, `peek*.py` | the probes used along the way (materials, shader props, clips, textures) |

## Slime recipe

1. **Model rule** (`data.bundle` MonoBehaviour named after the slime, e.g. `SL_Bat_WindDark`):
   `normalModelResourceName = SL_Bat_WindDark_Normal`, `baseModelResourceName = SL_Bat_WindDark_Base`,
   `mainMaterialCount = 1`, `EquipmentRuleList = [{material: 20017, meshRuleDataList: [{equipmentCondition: 0,
   defaultResourceName: "DevilWing001"}]}]`.
   - `_Base.prefab` = body only (1 SMR, 6 bones). `EQ_<name>_DevilWing001.prefab` = wing part only (its own copy of the
     skeleton, 1 SMR). `_Normal.prefab` = both baked into **one** SMR with 2 submeshes (body material + wing material).
     `_Normal.asset` is that combined Mesh. A `SkinnedMeshCombiner`-like MonoBehaviour on Base (`m_CombineBones=1`,
     `m_PreserveSubmeshes=1`) is how the game builds Normal at runtime when equipment changes.
   - For the web we export **Normal** (default look). Other equipment variants need Base + EQ parts sharing bone names
     (all three prefabs use the same 6 bone names: `_Root/Pelvis/{Ear_L1,Ear_R1,Wing_L1,Wing_R1}`).
   - `material: 20017` in the rule is an equipment material id. The proto does not use it yet.
2. **Bundles**: `character_sl_<name lower>.bundle` (prefabs, meshes, materials, textures) +
   `character_shared_sl_<species>.bundle` (12 `SL_<Species>_0_*` AnimationClips) + `shader.bundle` (shader, ramp, matcaps).
   The controller lives in `character_shared_animationcontroller.bundle`. The proto doesn't need it because clip names
   are self-describing.
3. **Skeleton**: walk the Transform tree from the Normal prefab root GameObject (the Animator and the SMR sit on the root
   itself). Binding path hash = `crc32(path relative to root, no root name)`. All 18 transform bindings resolved, none skipped.
4. **Mesh**: 1033 verts / 1314 tris / 6 bones, max 4 weights. Channels: UV0 (albedo), **UV1 = decal UV**, COLOR
   (B = outline width), tangents (not exported). Exported as POSITION, NORMAL, TEXCOORD_0, TEXCOORD_1, COLOR_0,
   JOINTS_0 (u8), WEIGHTS_0.
5. **Clips**: Unity generic clips: streamed (cubic Hermite segments), dense and constant parts, in binding order. Sampled at
   30 fps to LINEAR glTF channels. `_Root` is constant (pos/quat/scale in the constant part). The other 5 bones animate
   pos + **euler** + scale.
   - Clip `typeID 114` bindings animate a MonoBehaviour (`DecalView`). Their attribute = `crc32("decalViewWeight1".."9")`.
     These are the **face expression** weights. They go into `animations[i].extras.decalWeights = {times, "1".."9"}`.
     The viewer interpolates them every frame. Hit shows the `> <` eyes, so the mapping is correct.
   - Clip events (Walk has 2, footsteps) -> `extras.events`. `extras.loop` comes from `m_LoopTime` (Idle, Walk, *_Loop).
6. **Textures**: Albedo DXT1, Mask BC7, Decal BC7 with alpha, wing Emission DXT1, all 512². Embedded as WebP
   (`EXT_texture_webp`): q90 for colour, lossless for mask/decal. Mask/decal/emission texture ids go in
   `material.extras.tex` and the viewer fetches them with `gltf.parser.getDependency('texture', id)`. Shared ramp/matcaps
   are written once to `proto/slime/shared/*.png` and referenced by name in `material.extras.shared`.

### Sizes (SL_Bat_WindDark, WebP)

- GLB total **232.5 KB**. PNG variant `SL_Bat_WindDark.png.glb` is 303 KB.
- Textures 36.8 KB (Albedo 5.9, Mask 6.5, Decal 15.6, wing Albedo 5.3, wing Emission 3.5). As PNG they are 107 KB.
- Mesh + skin + JSON ≈ 105 KB (float32 everything; quantise to cut it about in half).
- Clips 91 KB total, float32 at 30 fps:

| clip | s | loop | KB |
|---|---|---|---|
| Attack | 0.83 | | 7.3 |
| Hit | 0.67 | | 6.3 |
| Idle | 1.33 | yes | 9.5 |
| IdleA | 2.67 | | 15.6 |
| IdleB | 2.33 | | 17.6 |
| Skill_Melee_Enter / Exit / Loop | 0.33 / 0.67 / 0.33 | Loop | 4.2 / 6.3 / 4.1 |
| Skill_Range_Enter / Exit / Loop | 0.33 / 0.67 / 0.33 | Loop | 4.2 / 6.3 / 4.2 |
| Walk | 0.53 | yes | 5.4 |

Clips are per **species** (`character_shared_sl_bat`), not per slime. The full exporter should write one clip GLB (or
JSON) per species and keep the per-slime GLB mesh-only. That puts a slime at about 140 KB plus about 90 KB per species,
or about 30 KB with int16 quaternions and 15 fps.

## Shader `MixMaster/Unit/Unit Matcap wip` (all slime materials)

Read from `shader.bundle` `m_ParsedForm` (property list + attributes; the bytecode was not decompiled).
Passes: `UniversalForward`, `Outline_Normal` (cull front = inverted hull, queue Geometry+2), `Sobel_Rim`,
`SHADOWCASTER`, `DepthOnly` (+ `*_Screenshot` twins).

| group | props (Bat values) | meaning (from Inspector titles) |
|---|---|---|
| Base | `_MainTex`, `_Color` 1, `_HColor` .72 grey, `_SColor` (.62,.60,.62), `_VColor` 1, `_Ramp` = `TCP2_Ramp_cartoon_intense` (8×1: 2 dark px then white -> hard step at ~0.25) | ToonyColorsPro-style ramp: lit = albedo·HColor, shadow = albedo·SColor |
| Outline | `_OutlineColor` .8, `_OutlineEmissionPower` .5 | "Outline Strength = VertexColor B" (B is 150..255 on the body) |
| Decal (UV 2) | `_DecalTex`, `_DecalView` 1, `_DecalCount` 3 | 3×3 atlas of expressions (Bat uses cells 1-3: open eyes, blink-ish, `>`). Cell uv = (uv1 + (col,row)) / 3. Blended by `DecalView.decalViewWeight1..9`, which the clips animate |
| Sub decal (UV 3) | `_UseSubDecal` 0 | unused on Bat |
| Mask | `_MaskTex` | **R = specular/rim on**, **G = white -> set A, black -> set B** (spec+rim), **B = matcap mask**. Bat body: R1 G0 B1 (set B), wing/ears: white (set A) |
| Matcap (Vertex Color G) | `_Matcaptitle` 0, `_HairMatCapTex` `Mixmaster_Matcap03`, `_MatCapTex` | off on Bat |
| Overlay | `_UseOverlay` 0, `_OverlayMatcapTex` `Mixmaster_Matcap16` | off |
| Specular A/B | size .03/.06, smooth .015/.015, colour A (.25,.76,.83) B (.45,.32,.58) | toon highlight: smoothstep on N·H |
| Rim A/B | min .5/.5, max .7/.8, strength .3/.304, colour (.51,.49,1,a .6) | smoothstep on 1-N·V |
| Emission | `_EmissionMap` (wing only), `_EmissionColor` (.19,1,1), `_EmissionPower` 1.5, `_BlinkEnabled` 0 + `_SinRamp` | glow lines on the wing |
| FX | `_HitColor`/`_HitPower`, `_SkillColor`/`_SkillPower`, `_ADDEffectColor`/`Power` | flash tints driven by code (HDR colours, e.g. 156,21,15) |
| Skin | `_skinTex`, `_SkinNum` 1-16, `_SkinTex` (UV 3) | extra skins, off |

Keywords seen on materials: `_DECAL _EMISSION _MASK _RIMLIGHTING _SPECULAR` (stored as "invalid", meaning the toggles are
on). `view.html` implements an approximation: ramp toon + mask-selected spec/rim A/B + decal atlas with animated
weights + emission + inverted-hull outline scaled by vertex colour B. Outline colour is a guess (albedo × OutlineColor × 0.3).

Map shaders: `MixMaster/Enviroment/Base` (`_MainTex`, `_PipeTex`, `_Ramp` = `TCP2_Ramp_MixMasterUnit` 128×1,
`_SinRamp`, wind/wave/gradient params) and `MixMaster/Enviroment/Tile Blend` (`_MainTex` + `_BlendTex`, `_Ramp`,
`_Ramp2`, `WorldUVB = 1`, vertex colours), plus `.../Transparent`. Map textures are tiny flat-colour palette atlases
(256², 1-2 KB WebP).

## Map

- The 83 `map_*` bundles are small (4-250 KB). They hold **prefab libraries**: GameObjects with MeshFilter/MeshRenderer
  whose Mesh and Material live in `mapres_*` (one level of dependencies, plus `shader.bundle`). In `map_path_t07`, all 11
  pieces (`Path_t07-A_a_1 … B_d_1`) sit at the origin. They are autotile variants (center/edge/corner). In
  `map_ter09_historicsite`, stair/cliff pieces have their own small offsets.
- The layout is built at runtime from `data.bundle` `MapCombineDataSet` (`classfication.grounds[]` with
  `centerTiles / edgeTiles / convexCornerTiles / concaveCornerTiles / groundEdgeTiles`), which is autotiling. The tile
  grid per map still has to be found (likely another data asset or server data). **This is the next research item before
  maps can be rebuilt.**
- Exported: `map_path_t07.glb` 29.4 KB (11 pieces, 2 materials, 7 textures), `map_t07_wind.glb` 38.8 KB,
  `map_ter09_historicsite.glb` 641.5 KB (24 pieces, 27 materials), `map_path_03.glb` 464 KB (props). The viewer lays
  out pieces on a 2.4 m grid when all sit at the origin.

## Traps hit, and fixes

1. **Euler rotation order** (the big one): clips store bone rotation as euler curves (binding attribute 4). The toc-do
   decoder uses Unity's default ZXY order (q = qy·qx·qz), which turned the pelvis 131° and made the slime lie on its face.
   `GenericBinding.customType` holds the rotation order (`math::RotationOrder`: 0 XYZ, 1 XZY, 2 YZX, 3 YXZ, 4 ZXY,
   5 ZYX). These Blender-made clips have **0 = XYZ** -> q = qz·qy·qx. Proof: euler (0,90,-90) with order 0 reproduces the
   Pelvis rest quaternion (0.5,0.5,-0.5,0.5) exactly. `wos.euler_to_q(e, order)` now follows customType.
2. UnityPy 1.25: parsed objects have no `.path_id` and no `.read_typetree()`. Use `obj.object_reader.path_id` and
   `obj.object_reader.read_typetree()`. PPtrs keep `.path_id`.
3. External CAB names (`CAB-…`) don't match bundle file names. Build `cache/cabmap.json` from bundle headers first.
   Reading headers for 4213 bundles took over 2 min (wwise bundles), so run it in the background.
4. Material texture PPtrs with `m_FileID 3` point into `shader.bundle`: ramp, matcaps and the shader itself.
5. three r160 ShaderMaterial already declares `attribute vec2 uv1`. Redeclaring it fails the shader compile
   ("'uv1' : redefinition").
6. three r160 uploads sRGB textures as SRGB8 and decodes them on sample. A shader that does its own `pow(2.2)` must set
   `texture.colorSpace = NoColorSpace` before the first upload, or colours get darkened twice.
7. Non-standard glTF attribute `_COLOR` arrives in three as `geometry.attributes._color` (lower-cased).
8. Coordinate system: flip X (UnityGLTF convention), not Z, so the slime faces +Z (toward a default three camera):
   p -> (-x,y,z), q -> (x,-y,-z,w), bind poses S·M·S, triangle winding reversed. Translation curves get -x, quaternion
   curves (x,-y,-z,w).
9. `MonoBehaviour` float curves in a generic clip take 1 slot each in the streamed/dense/constant arrays. Skipping them
   without advancing the index shifts every later curve.
10. Heredoc in Git Bash broke on a long Python file (unexpected EOF). Write such scripts with the Write tool.

## Still wrong / unknown

- Outline colour and width, and the exact ramp UV (N·L half-Lambert assumed), are guesses. Rim/spec maths is approximate
  (the shader bytecode was not decompiled; doing that would need DXBC disassembly of `shader.bundle`).
- The game's post-processing (URP colour grading, bloom) is not reproduced. In-game frames look brighter and more pastel.
- Tile Blend: which channel mixes `_MainTex` and `_BlendTex` (vertex colour R? world UV?) is unknown. With R=1 everything
  turns pink, so the viewer shows `_MainTex` only (`blend=1` to try the mix).
- No close-up reference of a Bat slime yet. The clip frames in `clips/frames` show slimes very small from the top-down
  camera (~55°). Proportions and palette match the dark-purple bat silhouette style, but a side-by-side check against a
  real frame is still to do.
- Map layout (tile grid per map) is not found yet. Equipment swapping (Base + EQ parts) is not exported (Normal only).
