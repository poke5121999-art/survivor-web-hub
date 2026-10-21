# World of Slime Demo: asset inventory

Source: `D:\Steam\steamapps\common\World of Slime Demo\World of Slime_Data`. All numbers come from
`cache/bundle_index.json` (made by `tools/index_bundles.py`, about 5 min with 4 workers, 0 errors, 0 timeouts).
Index layout: `bundles{file: {size, cabs, deps, objects{type:n}, names{type:[list,total]}, container[], roots[]}}`,
`cab_map{CAB: bundle}`, `scripts{"CAB:pathid": class}` (5364 resolved MonoScript classes), `nonaddr{...}`.
Name lists are capped at 300 per type per bundle (total kept next to the list).

## Totals
- 4206 `.bundle` files in `StreamingAssets\StandaloneWindows64` (BRIEF said 4213; the other 7 are not bundles), 1879 MB.
- Wwise audio is 776 MB of that (2243 bundles); everything else is about 1100 MB.
- Non-addressable: resources.assets 10.2 MB (UI prefabs, 245 Texture2D, 398 Sprite, 6 TextAsset), sharedassets0 (556 Sprite, UI atlas),
  globalgamemanagers.assets (5532 MonoScript = the script table, plus shaders), level0..4 scenes (see DATA.md).
- Texture format ids (UnityPy TextureFormat): 10 DXT1, 12 DXT5, 25 BC7, 3 RGB24, 4 RGBA32, 1 Alpha8. All decode with UnityPy.

## Families (count, MB, content, needed by a web build?)
| family | n | MB | holds | web build |
|---|---|---|---|---|
| wwisedata_windows_* | 2243 | 776 | one `WwiseStreamingMediaAsset` MonoBehaviour per bundle = one .wem (container `.../Media/<id>.wem`); names like `sfx_idle_starfish_waterfire_2_na`, `sfx_skill_arrow_dark`, `ui_mixing_successrate` | yes, a subset: vgmstream to ogg/mp3 |
| wwisesoundbank | 1 | 0.5 | 300 soundbank assets (.bnk event graph) | needed to map event to wem |
| character_sl_<species>_<elements> | 218 | 114 | 3D slime: `SL_X_Normal`/`SL_X_Base` trees (835 SkinnedMeshRenderer), Mesh, Material, Texture2D (Albedo/Mask/Decal/Emission, 512 or 256, DXT1/DXT5/BC7), `SlimeModelInfo`, `SMMaterialModifier`, equipment meshes `EQ_SL_X_Vent001` | yes, GLB export (120 species, 218 variants) |
| character_shared_sl_<species> (+ _animationcontroller) | 121 | 93 | per-species AnimationClips (1521 total: Idle, IdleA, IdleB, Walk, Attack, Hit, Skill_Melee_{Enter,Loop,Exit}, Skill_Range_*) and AnimatorOverrideController | yes, clips go into the GLB |
| texture_sl_* | 205 | 37 | 512x512 DXT5 Sprites, 2 per variant | yes |
| texture_item_* | 558 | 9.4 | 256x256 DXT5 item icons | yes (one atlas) |
| texture_icon_* | 209 | 6 | 256x256 skill/perk icons (`texture_icon_skill_windspout`, `texture_icon_perk_autoattack`) | yes |
| texture_npc_* | 94 | 24 | NPC dialogue portraits, 512x618 RGBA32 | yes |
| texture_thumb / bufficon / mapicon / mapbackground / img / skillindicator / dialogue* / introstory / storyillust | about 50 | about 70 | world-map pictures 612x354, story art 3840x2160 BC7 (30 MB), intro 1920x1080 | optional, story art is heavy |
| object_npc_<town>_<kind> | 110 | 45 | 3D NPC bodies (larus, talpa, noecheon, cochlea, makina, hydrus, aquila) | yes |
| object_pr_*, object_har_*, object_obj, object_common, object_t | about 190 | about 4 | props, harvestables (ironore, tree), vehicle, signs | yes |
| object_shared_* | 47 | 150 | `red_npc_*`, `red_pr_*` animation clips and controllers (788 clips) | needed for NPC animation |
| customize + customize_shared | 2 | 22 | player parts `PC_Man_Hair001`, `PC_Woman_Costume*`, eyebrows, 85 clips | yes (player avatar) |
| map_ter* / map_t* / map_int* / map_path / map_synt / map_cliff / map_npc / map_waterfall / map_shadow | about 60 | about 11 | map prefabs that reference meshes in mapres_*. Terrains ter00 stair, ter01 forest, ter02 sea, ter03 grassland, ter04 badland, ter05 cave, ter06 mountain, ter07 cemetery, ter08 ice, ter09 historicsite; towns t00 publicfacilities, t01 larus, t02 talpa, t03 noecheon, t06 makina, t07 wind, t08 hydrus; interiors int01 tutorial .. int08 witch | yes (prefabs only) |
| mapres_* (t, ter, int, waterfall, npc, path, synt, props, cliff, ambientenvironment, matcap) | about 33 | about 330 | the real meshes and textures (2048 BC7/DXT) | yes, the heavy part: mapres_t 79, ter 59, waterfall 57, npc 40, int 38 |
| fx, fx_resource, item_cube*, item_item, item_shared | about 9 | about 35 | 3508 GameObjects, 3048 ParticleSystem, 1962 Material, 293 DXT5 128px textures | reimplement; particle systems are not portable |
| ui_shared | 1 | 35 | 952 Sprite, 66 Texture2D (2048 atlases) | yes |
| ui_view / popup / play / common / objects / tutorial | 6 | about 7 | uGUI prefabs (13458 MonoBehaviour in ui_view) | layout reference, rebuild in HTML |
| font | 1 | 42 | 23 TMP_FontAsset, 16 Font (CJK, 2048 SDF atlases) | no, use web fonts |
| shader, unitybuiltinassets | 2 | 5 | 141 Shader | no |
| data | 1 | 0.7 | 232 ScriptableObjects, see DATA.md | yes |
| localization-* | 53 | 0.5 | 17 languages x (string-tables, asset-tables, assets) + shared + locales | yes, see data/loc |
| cutscene_merge_{success,failed} | 2 | 6 | Timeline cutscenes (slime merge) | reference |
| video_prologue | 1 | 61 | VideoClip + `Prologue.json` TextAsset (25 KB) | optional |
| mapsound / mapobject / monoscripts / game_shared | 4 | 5 | AkAmbient (161), props, 537 MonoScript | reference |

Also `StreamingAssets\Login_MP4_Bg_2048x1024.mp4`; the real file name has a U+00D7 multiplication sign instead of x.

## Slime naming
`SL_<Species>_<Element1><Element2?>`: 120 species, 218 variants (`SL_Bat_WindDark`, `SL_Slime_Fire`, size classes
`SL_SlimeSM/M/ML/L_*`, `SL_Potion_<element>`). 13 elements, ids 20001..20013: Fire, Water, Ground, Wind, Grass, Steel,
Electric, Ice, Magic, Power, Light, Dark, Poison. Every character bundle depends on `CAB-56d6fee3...` (monoscripts.bundle),
its `character_shared_sl_<species>` bundle and a texture bundle; resolve with `cab_map`.

## Traps (UnityPy 1.25, py -3.12)
1. `python -I` ignores `PYTHONIOENCODING`, so Vietnamese prints crash with cp1252. Call `sys.stdout.reconfigure(encoding="utf-8")` in every script.
2. In bundles, `m_Script` PPtr path ids are 64-bit hashes and the file id points to a CAB (`archive:/CAB-x/CAB-x`), not a file name.
   Resolve through `scripts["<CAB>:<pathid>"]`, built from the MonoScripts of monoscripts.bundle + globalgamemanagers.assets, using the
   basename of `externals[fileID-1].path` as the CAB key. All 7732 behaviours resolved.
3. Player files (resources.assets, sharedassets*, level*, globalgamemanagers.assets) have no typetrees for game MonoBehaviours.
   `read_typetree()` raises "Expected to read N bytes, but only read 32 bytes" (1144 failures, all in those files, mostly UI prefab
   components). Workaround used in `tools/scenes.py`: `o.get_raw_data()`, PPtr gameobject (i32 + i64), enabled u8 padded to 4, PPtr script at
   byte 16, mapped through globalgamemanagers.assets MonoScripts. Full fields would need the il2cpp TypeTreeGenerator; not worth it.
4. GameObject, Transform, Texture2D, Mesh, AnimationClip, AssetBundle read fine everywhere. Texture2D `.read()` does not decode pixels until `.image`, so indexing is cheap.
5. A multiprocessing pool must be rebuilt around a stuck bundle: index_bundles uses `maxtasksperchild=20` and `get(timeout)`; none timed out here.
6. Windows: `pkill` and `wmic` are missing in Git Bash (use PowerShell `Get-CimInstance Win32_Process | Stop-Process`). Backgrounding `py ... &`
   after a heredoc hung the tool; use PowerShell `Start-Process -RedirectStandardOutput`.
7. Cross-bundle references are by CAB name; reading one bundle alone leaves PPtr targets in other bundles unresolved (`deps` in the index lists them).
8. A Bash heredoc that contains a line consisting of only the terminator word silently truncates; the Write tool is safer for notes.
